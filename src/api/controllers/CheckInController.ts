import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type AnyKeys, type PipelineStage } from "mongoose";

import CheckIn, { type ICheckIn } from "../../models/CheckIn.js";
import { ResourceTypeEnum } from "../../models/Enum/ResourceTypeEnum.js";
import Event, { type IEvent } from "../../models/Event.js";
import Follow from "../../models/Follow.js";
import Media, { type IMedia } from "../../models/Media.js";
import Notification, {
  NotificationTypeEnum,
} from "../../models/Notification.js";
import Place from "../../models/Place.js";
import ScheduledTask, {
  ScheduledTaskStatus,
  ScheduledTaskType,
} from "../../models/ScheduledTask.js";
import Upload from "../../models/Upload.js";
import User, { UserRoleEnum } from "../../models/User.js";
import { ResourcePrivacyEnum } from "../../models/UserActivity.js";
import strings, { dStrings, dynamicMessage } from "../../strings.js";
import { getRandomDateInRange } from "../../utilities/dateTime.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { filterObjectByConfig } from "../../utilities/filtering.js";
import { fakeObjectIdString } from "../../utilities/generator.js";
import { shouldBotInteract } from "../../utilities/mundo.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
import MediaProjection from "../dto/media.js";
import PlaceProjection from "../dto/place.js";
import UserProjection from "../dto/user.js";
import { UserActivityManager } from "../services/UserActivityManager.js";
import { checkinEarning } from "../services/earning.service.js";
import logger from "../services/logger/index.js";
import { addReward } from "../services/reward/reward.service.js";
import validate from "./validators.js";

const checkInWaitTime = 1; // minutes

export const getCheckInsValidation: ValidationChain[] = [
  query("user").optional().isMongoId().withMessage("Invalid user id"),
  query("place").optional().isMongoId().withMessage("Invalid place id"),
  query("event").optional().isMongoId().withMessage("Invalid event id"),
  validate.page(query("page").optional(), 50),
  validate.limit(query("limit").optional(), 1, 500),
  query("count").optional().isBoolean().withMessage("Invalid count"),
];
/**
 * @query user    string      |     to get checkins of a user
 * @query place   string      |     to get checkins of a place
 * @query event   string      |     to get checkins of an event
 * @query page    number      |     page
 * @query limit   number      |     limit
 * @query count   boolean     |     count
 */
export async function getCheckIns(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const user = req.query.user
      ? new mongoose.Types.ObjectId(req.query.user as string)
      : null;
    const place = req.query.place
      ? new mongoose.Types.ObjectId(req.query.place as string)
      : null;
    const event = req.query.event
      ? new mongoose.Types.ObjectId(req.query.event as string)
      : null;

    const { page, limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 500,
      maxLimit: 500,
    });

    const matchPipeline: PipelineStage[] = [];

    const privacyPipeline: PipelineStage[] = [
      {
        $lookup: {
          from: "follows",
          localField: "user",
          foreignField: "target",
          as: "followDetails",
        },
      },
      {
        $addFields: {
          isFollowed: {
            $anyElementTrue: {
              $map: {
                input: "$followDetails",
                as: "followDetail",
                in: {
                  $eq: ["$$followDetail.user", authUser._id],
                },
              },
            },
          },
        },
      },
      {
        $match: {
          $or: [
            { privacyType: "PUBLIC" },
            {
              privacyType: "PRIVATE",
              user: authUser._id,
            },
            { privacyType: "FOLLOWING", isFollowed: true },
          ],
        },
      },
    ];

    if (user) {
      //PRIVACY
      const userObject = await User.findById(user).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User"),
          StatusCodes.NOT_FOUND
        )
      );

      if (!user.equals(authUser._id) && userObject.isPrivate) {
        await Follow.exists({
          user: authUser._id,
          target: userObject._id,
        }).orFail(
          createError(
            "You are not allowed to view this user's check-ins",
            StatusCodes.FORBIDDEN
          )
        );
      }

      matchPipeline.push({
        $match: { user: user },
      });
    }
    if (place) {
      // TODO: Add privacy check here
      matchPipeline.push({
        $match: { place: place },
      });
    }
    if (event) {
      matchPipeline.push({
        $match: { event: event },
      });
    }

    const result = await CheckIn.aggregate([
      ...matchPipeline,
      ...privacyPipeline,
      {
        $facet: {
          count: [
            {
              $count: "count",
            },
          ],
          checkIns: [
            {
              $sort: { createdAt: -1 },
            },
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
            {
              $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
                pipeline: [
                  {
                    $project: UserProjection.essentials,
                  },
                ],
              },
            },
            {
              $lookup: {
                from: "places",
                localField: "place",
                foreignField: "_id",
                as: "place",
                pipeline: [
                  {
                    $project: {
                      ...PlaceProjection.brief,
                      location: PlaceProjection.locationProjection,
                    },
                  },
                ],
              },
            },
            {
              $lookup: {
                from: "media",
                localField: "media",
                foreignField: "_id",
                as: "media",
                pipeline: [
                  {
                    $project: MediaProjection.brief,
                  },
                ],
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "tags",
                foreignField: "_id",
                as: "tags",
                pipeline: [
                  {
                    $project: UserProjection.essentials,
                  },
                ],
              },
            },
            {
              $project: {
                _id: 1,
                caption: 1,
                tags: 1,
                privacyType: 1,
                createdAt: 1,
                updatedAt: 1,
                media: 1,
                user: { $arrayElemAt: ["$user", 0] },
                place: { $arrayElemAt: ["$place", 0] },
              },
            },
          ],
        },
      },
      {
        $project: {
          count: { $arrayElemAt: ["$count.count", 0] },
          checkIns: 1,
        },
      },
    ]).then((result) => result[0]);

    // TODO: Remove this temporary migration fix
    for (const checkIn of result.checkIns) {
      checkIn.image = checkIn.media?.[0];
    }

    if (!user || !user.equals(authUser._id)) {
      // anonymize user data
      for (const checkIn of result.checkIns) {
        if (
          checkIn.privacyType === ResourcePrivacyEnum.Private &&
          !authUser._id.equals(checkIn.user._id)
        ) {
          checkIn._id = fakeObjectIdString();
          checkIn.user._id = fakeObjectIdString();
          checkIn.user.name = "Anonymous";
          checkIn.user.username = "Anonymous";
          checkIn.user.profileImage = null;
          checkIn.user.progress = {
            xp: Math.round(Math.random() * checkIn.user.progress?.xp ?? 100),
            level: Math.round(
              Math.random() * checkIn.user.progress?.level ?? 10
            ),
          };
        }
      }
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: result.checkIns,
      pagination: {
        totalCount: result.total || 0,
        page: page,
        limit: limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function enforceCheckInInterval(
  authId: mongoose.Types.ObjectId,
  authRole: UserRoleEnum
) {
  if (authRole !== UserRoleEnum.Admin) {
    const lastCheckIn = await CheckIn.findOne({ user: authId }).sort(
      "-createdAt"
    );
    if (lastCheckIn) {
      const diffMinutes =
        (new Date().getTime() - lastCheckIn.createdAt.getTime()) / 1000 / 60;
      if (diffMinutes < checkInWaitTime) {
        logger.debug(`check-in cool down: ${checkInWaitTime} minutes`);
        throw createError(
          `You must wait at least ${checkInWaitTime} minutes between check-ins`,
          StatusCodes.BAD_REQUEST
        );
      }
    }
  }
}

async function addCheckInReward(
  authId: mongoose.Types.ObjectId,
  checkin: ICheckIn
) {
  return addReward(authId, {
    refType: "CheckIn",
    refId: checkin._id,
    placeId: checkin.place,
  });
}

async function sendNotificiationToFollowers(
  authId: mongoose.Types.ObjectId,
  checkin: ICheckIn
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

export const createCheckInValidation: ValidationChain[] = [
  body("place")
    .custom((value, { req }) => {
      if (value && req.body.event) {
        throw createError(
          "You can't check-in to both place and event at the same time",
          StatusCodes.BAD_REQUEST
        );
      }
      return true;
    })
    .if((_, { req }) => !req.body.event)
    .isMongoId()
    .withMessage("Invalid place id"),
  body("event")
    .if((_, { req }) => !req.body.place)
    .isMongoId()
    .withMessage("Invalid event id"),
  body("privacyType").optional().isIn(Object.values(ResourcePrivacyEnum)),
  body("caption").optional().isString().trim(),
  body("image").optional().isMongoId().withMessage("Invalid image id"), // @deprecated | TODO: remove
  body("media").optional().isArray(),
  body("media.*").optional().isMongoId(),
  body("tags").optional().isArray(),
  body("tags.*").optional().isMongoId(),
];

export async function createCheckIn(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { caption, image, media } = req.body;
    const privacyType =
      (req.body.privacyType as ResourcePrivacyEnum) ||
      ResourcePrivacyEnum.Public;
    const mediaUploadIds = media
      ? (media as string[]).map((m) => new mongoose.Types.ObjectId(m))
      : image
      ? [new mongoose.Types.ObjectId(image as string)]
      : null;
    const eventId = req.body.event
      ? new mongoose.Types.ObjectId(req.body.event as string)
      : null;
    const tags = Array.isArray(req.body.tags)
      ? Array.from(new Set(req.body.tags as string[])).map(
          (tag) => new mongoose.Types.ObjectId(tag)
        )
      : null;
    let place = req.body.place
      ? new mongoose.Types.ObjectId(req.body.place as string)
      : null;

    if (place) {
      await Place.exists({ _id: place }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Place"),
          StatusCodes.NOT_FOUND
        )
      );
    } else if (eventId) {
      const theEvent = await Event.findById(eventId)
        .select<{ place: IEvent["place"] }>("place")
        .orFail(
          createError(
            dynamicMessage(dStrings.notFound, "Event"),
            StatusCodes.NOT_FOUND
          )
        )
        .lean();
      place = theEvent.place;
    } else {
      throw createError(
        "Either place or event is required",
        StatusCodes.BAD_REQUEST
      );
    }

    await enforceCheckInInterval(authUser._id, authUser.role);

    if (tags) {
      logger.verbose("validate tags");
      await Promise.all(
        tags.map((userId) =>
          User.exists({ _id: userId }).orFail(
            createError(
              dynamicMessage(dStrings.notFound, "Tagged user"),
              StatusCodes.NOT_FOUND
            )
          )
        )
      );
    }

    let mediaDocs: IMedia[] | null = null;
    if (mediaUploadIds && mediaUploadIds.length > 0) {
      logger.verbose("Validating media");
      mediaDocs = [];
      for (const mediaUploadId of mediaUploadIds) {
        const upload = await Upload.findById(mediaUploadId).orFail(
          createError(
            dynamicMessage(dStrings.notFound, "Uploaded media"),
            StatusCodes.NOT_FOUND
          )
        );

        if (!authUser._id.equals(upload.user)) {
          throw createError(
            strings.authorization.otherUser,
            StatusCodes.FORBIDDEN
          );
        }

        const media = await Media.create({
          type: upload.type,
          user: authUser._id,
          place,
          caption,
          src: upload.src,
          ...(eventId ? { event: eventId } : {}),
        });

        mediaDocs.push(media.toObject());

        await upload.deleteOne();
      }
    }

    const checkinBody: ICheckIn | AnyKeys<ICheckIn> = {
      user: authUser._id,
      place: place,
      caption: caption,
      tags: tags,
      privacyType: privacyType || ResourcePrivacyEnum.Public,
      ...(mediaDocs ? { media: mediaDocs.map((m) => m._id) } : {}),
      ...(eventId ? { event: eventId } : {}),
    };

    const checkIn = await CheckIn.create(checkinBody);

    const activity = await UserActivityManager.createCheckInActivity(
      authUser,
      place,
      mediaDocs !== null && mediaDocs.length > 0,
      checkIn._id,
      privacyType
    );

    checkIn.userActivityId = activity._id;

    await checkIn.save();

    const reward = await addCheckInReward(authUser._id, checkIn);

    const checkInObject = checkIn.toObject();

    // TODO: Remove this temporary migration fix
    // @ts-ignore
    checkInObject.image = mediaDocs?.[0]
      ? filterObjectByConfig(mediaDocs[0], MediaProjection.brief)
      : null;

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: {
        ...checkInObject,
        media: mediaDocs?.map((m) =>
          filterObjectByConfig(m, MediaProjection.brief)
        ),
      },
      reward: reward,
    });

    await Promise.all([
      checkinEarning(authUser._id, checkIn._id),
      Place.updateOne(
        { _id: place },
        { $inc: { "activities.checkinCount": 1 } }
      ),
      User.updateOne({ _id: authUser._id }, { latestPlace: place }),
      sendNotificiationToFollowers(authUser._id, checkIn),
    ]);

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

export const deleteCheckInValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid checkin id"),
];
export async function deleteCheckIn(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const checkin = await CheckIn.findById(id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "Check-in"),
        StatusCodes.NOT_FOUND
      )
    );

    if (!authUser._id.equals(checkin.user) && authUser.role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    await checkin.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
