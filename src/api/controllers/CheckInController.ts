import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose, { type AnyKeys, type PipelineStage } from "mongoose";

import CheckIn, { type ICheckIn } from "../../models/CheckIn.js";
import { ResourceTypeEnum } from "../../models/Enum/ResourceTypeEnum.js";
import Event from "../../models/Event.js";
import Follow from "../../models/Follow.js";
import Media, { MediaTypeEnum, type IMedia } from "../../models/Media.js";
import Notification, {
  NotificationTypeEnum,
} from "../../models/Notification.js";
import Place from "../../models/Place.js";
import ScheduledTask, {
  ScheduledTaskStatus,
  ScheduledTaskType,
} from "../../models/ScheduledTask.js";
import Upload from "../../models/Upload.js";
import User from "../../models/User.js";
import { ResourcePrivacyEnum } from "../../models/UserActivity.js";
import strings, { dStrings, dynamicMessage } from "../../strings.js";
import { getRandomDateInRange } from "../../utilities/dateTime.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { shouldBotInteract } from "../../utilities/mundo.js";
import { getPaginationFromQuery } from "../../utilities/pagination.js";
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
          total: [
            {
              $count: "total",
            },
          ],
          checkins: [
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
                localField: "image",
                foreignField: "_id",
                as: "image",
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      src: 1,
                      caption: 1,
                      type: 1,
                    },
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
              $unwind: {
                path: "$image",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $unwind: "$user",
            },
            {
              $unwind: "$place",
            },
            {
              $project: {
                _id: 1,
                createdAt: 1,
                user: 1,
                place: 1,
                caption: 1,
                image: 1,
                privacyType: 1,
                tags: 1,
              },
            },
          ],
        },
      },
    ]).then((result) => result[0]);

    if (!user || !user.equals(authUser._id)) {
      // anonymize user data
      result.checkins = result.checkins.map((checkin: any) => {
        if (
          checkin.privacyType === ResourcePrivacyEnum.Private &&
          !authUser._id.equals(checkin.user._id)
        ) {
          checkin._id = Math.random()
            .toString(16)
            .substring(2, 10)
            .padEnd(24, "0");
          checkin.user._id = Math.random()
            .toString(16)
            .substring(2, 10)
            .padEnd(24, "0");
          checkin.user.name = "Anonymous";
          checkin.user.username = "Anonymous";
          checkin.user.profileImage = null;
          checkin.user.progress = {
            xp: Math.round(checkin.user.progress?.xp / 100) * 100,
            level: Math.round(checkin.user.progress?.level / 10) * 10,
          };
        }
        return checkin;
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: result.checkins,
      pagination: {
        totalCount: result.total[0]?.total || 0,
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
  authRole: string
) {
  if (authRole !== "admin") {
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
  body("caption").optional().isString(),
  body("image").optional().isMongoId(),
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
    const { caption, tags, image } = req.body;
    const privacyType =
      (req.body.privacyType as ResourcePrivacyEnum) ||
      ResourcePrivacyEnum.Public;
    const event = req.body.event
      ? new mongoose.Types.ObjectId(req.body.event as string)
      : null;
    const place = req.body.place
      ? new mongoose.Types.ObjectId(req.body.place as string)
      : null;

    let placeId: mongoose.Types.ObjectId;
    if (place) {
      await Place.exists({ _id: place }).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Place"),
          StatusCodes.NOT_FOUND
        )
      );
      placeId = place;
    } else if (event) {
      const theEvent = await Event.findById(event)
        .orFail(
          createError(
            dynamicMessage(dStrings.notFound, "Event"),
            StatusCodes.NOT_FOUND
          )
        )
        .lean();
      placeId = theEvent.place;
      logger.verbose("Check-in to event");
    } else {
      throw createError(
        "Either place or event is required",
        StatusCodes.BAD_REQUEST
      );
    }

    await enforceCheckInInterval(authUser._id, authUser.role);

    if (tags) {
      logger.verbose("validate tags");
      for (const userId of tags) {
        await User.exists({ _id: userId }).orFail(
          createError(
            dynamicMessage(dStrings.notFound, "Tagged user"),
            StatusCodes.NOT_FOUND
          )
        );
      }
    }

    let media;
    if (image) {
      logger.verbose("validate image");
      const upload = await Upload.findById(image).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Uploaded image"),
          StatusCodes.NOT_FOUND
        )
      );
      if (!authUser._id.equals(upload.user)) {
        throw createError(
          strings.authorization.otherUser,
          StatusCodes.FORBIDDEN
        );
      }
      if (upload.type !== "image") {
        throw createError(strings.upload.invalidType, StatusCodes.BAD_REQUEST);
      }

      const mediaBody: IMedia | AnyKeys<IMedia> = {
        type: MediaTypeEnum.Image,
        user: authUser._id,
        place: placeId,
        caption: caption,
        src: upload.src,
      };

      if (event) {
        mediaBody.event = event;
      }

      media = await Media.create(mediaBody);
    }

    const checkinBody: ICheckIn | AnyKeys<ICheckIn> = {
      user: authUser._id,
      place: placeId,
      caption: caption,
      tags: tags,
      privacyType: privacyType || ResourcePrivacyEnum.Public,
    };

    if (media) checkinBody.image = media._id;
    if (event) checkinBody.event = event;

    const checkIn = await CheckIn.create(checkinBody);

    const activity = await UserActivityManager.createCheckInActivity(
      authUser,
      placeId,
      Boolean(checkIn.image),
      checkIn._id,
      privacyType
    );

    checkIn.userActivityId = activity._id;

    await checkIn.save();

    const reward = await addCheckInReward(authUser._id, checkIn);

    res
      .status(StatusCodes.CREATED)
      .json({ success: true, data: checkIn, reward: reward });

    await Promise.all([
      checkinEarning(authUser._id, checkIn._id),
      Place.updateOne(
        { _id: placeId },
        { $inc: { "activities.checkinCount": 1 } }
      ),
      User.updateOne({ _id: authUser._id }, { latestPlace: placeId }),
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
