import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { AnyKeys, Types } from "mongoose";
import { z } from "zod";

import MediaProjection from "../../../api/dto/media.js";
import {
  addEarnings,
  EarningsType,
} from "../../../api/services/earning.service.js";
import logger from "../../../api/services/logger/index.js";
import { addReward } from "../../../api/services/reward/reward.service.js";
import { UserActivityManager } from "../../../api/services/UserActivityManager.js";
import type { ICheckIn } from "../../../models/CheckIn.js";
import CheckIn from "../../../models/CheckIn.js";
import { ResourceTypeEnum } from "../../../models/Enum/ResourceTypeEnum.js";
import type { IEvent } from "../../../models/Event.js";
import Event from "../../../models/Event.js";
import Follow from "../../../models/Follow.js";
import type { IMedia } from "../../../models/Media.js";
import Media from "../../../models/Media.js";
import Notification, {
  NotificationTypeEnum,
} from "../../../models/Notification.js";
import Place from "../../../models/Place.js";
import ScheduledTask, {
  ScheduledTaskStatus,
  ScheduledTaskType,
} from "../../../models/ScheduledTask.js";
import Upload from "../../../models/Upload.js";
import User, { UserRoleEnum } from "../../../models/user/user.js";
import { ResourcePrivacyEnum } from "../../../models/UserActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { getRandomDateInRange } from "../../../utilities/dateTime.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { filterObjectByConfig } from "../../../utilities/filtering.js";
import { shouldBotInteract } from "../../../utilities/mundo.js";
import { createResponse } from "../../../utilities/response.js";
import {
  validateData,
  zObjectId,
  zUniqueObjectIdArray,
} from "../../../utilities/validation.js";
import { sendSlackMessage } from "../SlackController.js";

const body = z.object({
  place: zObjectId.optional(), // TODO: make sure only one is provided
  event: zObjectId.optional(), // TODO: make sure only one is provided
  image: zObjectId.optional(), // @deprecated | TODO: remove
  media: zUniqueObjectIdArray.optional(),
  tags: zUniqueObjectIdArray.optional(),
  caption: z.string().trim().optional(),
  privacyType: z
    .nativeEnum(ResourcePrivacyEnum)
    .optional()
    .default(ResourcePrivacyEnum.Public),
  scores: z
    .object({
      overall: z.number().min(0).max(5).optional(),
      drinkQuality: z.number().min(0).max(5).optional(),
      foodQuality: z.number().min(0).max(5).optional(),
      service: z.number().min(0).max(5).optional(),
      atmosphere: z.number().min(0).max(5).optional(),
      value: z.number().min(0).max(5).optional(),
    })
    .optional(),
});

type Body = z.infer<typeof body>;

export const createCheckInValidation = validateData({
  body: body,
});

const checkInWaitTime = 1; // minutes

export async function createCheckIn(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { caption, image, media, place, event, tags, privacyType, scores } =
      req.body as Body;

    const mediaUploadIds = media || (image ? [image] : null);

    let thePlace: Types.ObjectId;
    if (place) {
      await Place.exists({ _id: place }).orFail(
        createError(
          dynamicMessage(ds.notFound, "Place"),
          StatusCodes.NOT_FOUND,
        ),
      );
      thePlace = place;
    } else if (event) {
      const theEvent = await Event.findById(event)
        .select<{ place: IEvent["place"] }>("place")
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "Event"),
            StatusCodes.NOT_FOUND,
          ),
        )
        .lean();
      thePlace = theEvent.place;
    } else {
      throw createError(
        "Either place or event is required",
        StatusCodes.BAD_REQUEST,
      );
    }

    await enforceCheckInInterval(authUser._id, authUser.role);

    if (tags) {
      logger.verbose("validate tags");
      await Promise.all(
        tags.map((userId) =>
          User.exists({ _id: userId }).orFail(
            createError(
              dynamicMessage(ds.notFound, "Tagged user"),
              StatusCodes.NOT_FOUND,
            ),
          ),
        ),
      );
    }

    let mediaDocs: IMedia[] | null = null;
    if (mediaUploadIds && mediaUploadIds.length > 0) {
      logger.verbose("Validating media");
      mediaDocs = [];
      for (const mediaUploadId of mediaUploadIds) {
        const upload = await Upload.findById(mediaUploadId).orFail(
          createError(
            dynamicMessage(ds.notFound, "Uploaded media"),
            StatusCodes.NOT_FOUND,
          ),
        );

        if (!authUser._id.equals(upload.user)) {
          throw createError(
            strings.authorization.otherUser,
            StatusCodes.FORBIDDEN,
          );
        }

        const media = await Media.create({
          type: upload.type,
          user: authUser._id,
          place: thePlace,
          caption,
          src: upload.src,
          ...(event ? { event } : {}),
        });

        mediaDocs.push(media.toObject());

        await upload.deleteOne();
      }
    }

    const checkinBody: ICheckIn | AnyKeys<ICheckIn> = {
      user: authUser._id,
      place: thePlace,
      caption: caption,
      tags: tags,
      privacyType: privacyType,
      ...(mediaDocs ? { media: mediaDocs.map((m) => m._id) } : {}),
      ...(event ? { event } : {}),
      ...(scores ? { scores } : {}),
    };

    const checkIn = await CheckIn.create(checkinBody);

    const activity = await UserActivityManager.createCheckInActivity(
      authUser,
      thePlace,
      mediaDocs !== null && mediaDocs.length > 0,
      checkIn._id,
      privacyType,
    );

    checkIn.userActivityId = activity._id;

    await checkIn.save();

    // TODO: Use websockets to send reward change
    const reward = await addCheckInReward(authUser._id, checkIn);

    const checkInObject = checkIn.toObject();

    // TODO: Remove this temporary migration fix
    // @ts-ignore
    checkInObject.image = mediaDocs?.[0]
      ? filterObjectByConfig(mediaDocs[0], MediaProjection.brief)
      : null;

    res.status(StatusCodes.CREATED).json(
      createResponse({
        ...checkInObject,
        media: mediaDocs?.map((m) =>
          filterObjectByConfig(m, MediaProjection.brief),
        ),
      }),
    );

    await Promise.all([
      Place.updateOne(
        { _id: thePlace },
        { $inc: { "activities.checkinCount": 1 } },
      ),
      User.updateOne({ _id: authUser._id }, { latestPlace: thePlace }),
      sendNotificiationToFollowers(authUser._id, checkIn),
      sendSlackMessage(
        "phantomAssistant",
        `New check-in from ${authUser.name}\n${mediaDocs && mediaDocs.length > 0 ? mediaDocs.length : "no"} media`,
      ),
    ]).catch((e) => {
      logger.error("Error after creating check-in", e);
    });

    // Add usd earning reward if media included and privacyType is public
    if (mediaDocs !== null && mediaDocs.length > 0 && checkIn.privacyType) {
      await addEarnings(
        authUser._id,
        EarningsType.MEDIA_INCLUDED_USER_ACTIVITY,
      );
    }

    // AI Comment
    if (checkIn.privacyType === ResourcePrivacyEnum.Public) {
      if (await shouldBotInteract(authUser._id)) {
        await ScheduledTask.create({
          status: ScheduledTaskStatus.Pending,
          type: ScheduledTaskType.CommentOnActivity,
          resourceId: checkIn.userActivityId,
          scheduledAt: getRandomDateInRange(60 * 60 * 3, 60 * 5),
        });
      }
    }
  } catch (err) {
    next(err);
  }
}

async function enforceCheckInInterval(
  authId: Types.ObjectId,
  authRole: UserRoleEnum,
) {
  if (authRole !== UserRoleEnum.Admin) {
    const lastCheckIn = await CheckIn.findOne({ user: authId }).sort(
      "-createdAt",
    );
    if (lastCheckIn) {
      const diffMinutes =
        (new Date().getTime() - lastCheckIn.createdAt.getTime()) / 1000 / 60;
      if (diffMinutes < checkInWaitTime) {
        logger.debug(`check-in cool down: ${checkInWaitTime} minutes`);
        throw createError(
          `You must wait at least ${checkInWaitTime} minutes between check-ins`,
          StatusCodes.BAD_REQUEST,
        );
      }
    }
  }
}

async function addCheckInReward(authId: Types.ObjectId, checkin: ICheckIn) {
  return addReward(authId, {
    refType: "CheckIn",
    refId: checkin._id,
    placeId: checkin.place,
  });
}

async function sendNotificiationToFollowers(
  authId: Types.ObjectId,
  checkin: ICheckIn,
) {
  const followers = await Follow.find({
    target: authId,
  }).lean();
  for (const follower of followers) {
    await Notification.create({
      user: follower.user,
      type: NotificationTypeEnum.FollowingCheckIn,
      resources: [
        {
          _id: checkin._id,
          type: ResourceTypeEnum.CheckIn,
          date: checkin.createdAt,
        },
      ],
      importance: 2,
    });
  }
}
