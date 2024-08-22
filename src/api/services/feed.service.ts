import mongoose, { type FilterQuery, type SortOrder } from "mongoose";

import Achievement from "../../models/achievement.js";
import Block from "../../models/block.js";
import CheckIn from "../../models/checkIn.js";
import Comment from "../../models/comment.js";
import { ResourceTypeEnum } from "../../models/enum/resourceTypeEnum.js";
import Follow from "../../models/follow.js";
import Homemade from "../../models/homemade.js";
import Place from "../../models/place.js";
import Review, { type IReview } from "../../models/review.js";
import User from "../../models/user/user.js";
import UserActivity, {
  ResourcePrivacyEnum,
  type IUserActivity,
} from "../../models/userActivity.js";
import {
  getCommentsOfActivity,
  getReactionsOfActivity,
} from "../controllers/activity/helpers.js";
import { type CheckInProjectionBrief } from "../dto/checkIn.js";
import MediaProjection, { MediaProjectionBrief } from "../dto/media.js";
import PlaceProjection, { type PlaceProjectionDetail } from "../dto/place.js";
import { type ReactionProjection } from "../dto/reaction.js";
import { UserProjection, type UserProjectionType } from "../dto/user.js";
import logger from "./logger/index.js";

export const getResourceInfo = async (
  activity: IUserActivity,
  authUserId: mongoose.Types.ObjectId,
) => {
  let resourceInfo: any;
  let placeInfo: any;

  const userInfo = await User.findOne({ _id: activity.userId })
    .select<UserProjectionType["essentials"]>(UserProjection.essentials)
    .lean();

  switch (activity.resourceType) {
    case ResourceTypeEnum.Place:
      resourceInfo = await Place.findById(activity.resourceId)
        .select<PlaceProjectionDetail>(PlaceProjection.detail)
        .lean();

      placeInfo = resourceInfo;
      break;
    case ResourceTypeEnum.Review:
      const review = await Review.aggregate<{
        _id: mongoose.Types.ObjectId;
        createdAt: Date;
        updatedAt: Date;
        content: string;
        recommend: boolean;
        place: PlaceProjectionDetail; // TODO: change location type;
        writer: UserProjectionType["essentials"];
        scores: IReview["scores"];
        media?: Array<MediaProjectionBrief>;
        tags?: Array<UserProjectionType["essentials"]>;
        userActivityId?: mongoose.Types.ObjectId;
        reactions: ReactionProjection;
      }>([
        {
          $match: {
            _id: activity.resourceId,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "writer",
            foreignField: "_id",
            as: "writer",
            pipeline: [
              {
                $project: UserProjection.essentials,
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
            from: "places",
            localField: "place",
            foreignField: "_id",
            as: "place",
            pipeline: [
              {
                $project: {
                  ...PlaceProjection.detail,
                  location: PlaceProjection.locationProjection,
                  scores: {
                    overall: 1,
                    drinkQuality: 1,
                    foodQuality: 1,
                    service: 1,
                    atmosphere: 1,
                    value: 1,
                    phantom: {
                      $cond: {
                        if: { $lt: ["$reviewCount", 4] },
                        then: "$$REMOVE",
                        else: "$scores.phantom",
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: "reactions",
            let: {
              userActivityId: "$userActivityId",
            },
            as: "reactions",
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$target", "$$userActivityId"] },
                },
              },
              {
                $facet: {
                  total: [
                    {
                      $group: {
                        _id: "$reaction",
                        count: { $sum: 1 },
                        type: { $first: "$type" },
                      },
                    },
                    {
                      $project: {
                        _id: 0,
                        reaction: "$_id",
                        type: 1,
                        count: 1,
                      },
                    },
                  ],
                  user: [
                    {
                      $match: {
                        user: authUserId,
                      },
                    },
                    {
                      $project: {
                        _id: 1,
                        type: 1,
                        reaction: 1,
                        createdAt: 1,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          $project: {
            _id: 1,
            createdAt: 1,
            updatedAt: 1,
            content: 1,
            recommend: 1,
            place: { $arrayElemAt: ["$place", 0] },
            writer: { $arrayElemAt: ["$writer", 0] },
            media: 1,
            scores: 1,
            tags: 1,
            userActivityId: 1,
            reactions: { $arrayElemAt: ["$reactions", 0] },
          },
        },
      ]).then((res) => res[0]);

      // TODO: remove on next update
      // @ts-ignore
      review.images = review.media?.filter((m) => m.type === "image");
      // @ts-ignore
      review.videos = review.media?.filter((m) => m.type === "video");

      resourceInfo = review;
      placeInfo = review.place;
      break;
    case ResourceTypeEnum.Homemade:
      const homemade = await Homemade.aggregate<{
        _id: mongoose.Types.ObjectId;
        createdAt: Date;
        updatedAt: Date;
        content: string;
        user: UserProjectionType["essentials"];
        media: Array<MediaProjectionBrief>;
        tags?: Array<UserProjectionType["essentials"]>;
        userActivityId?: mongoose.Types.ObjectId;
        reactions: ReactionProjection;
      }>([
        {
          $match: {
            _id: new mongoose.Types.ObjectId(activity.resourceId),
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
            from: "reactions",
            let: {
              userActivityId: "$userActivityId",
            },
            as: "reactions",
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$target", "$$userActivityId"] },
                },
              },
              {
                $facet: {
                  total: [
                    {
                      $group: {
                        _id: "$reaction",
                        count: { $sum: 1 },
                        type: { $first: "$type" },
                      },
                    },
                    {
                      $project: {
                        _id: 0,
                        reaction: "$_id",
                        type: 1,
                        count: 1,
                      },
                    },
                  ],
                  user: [
                    {
                      $match: {
                        user: authUserId,
                      },
                    },
                    {
                      $project: {
                        _id: 1,
                        type: 1,
                        reaction: 1,
                        createdAt: 1,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          $project: {
            _id: 1,
            createdAt: 1,
            updatedAt: 1,
            content: 1,
            user: { $arrayElemAt: ["$user", 0] },
            media: 1,
            tags: 1,
            userActivityId: 1,
            reactions: { $arrayElemAt: ["$reactions", 0] },
          },
        },
      ]).then((res) => res[0]);

      resourceInfo = homemade;
      break;
    case ResourceTypeEnum.CheckIn:
      const result = await CheckIn.aggregate<{
        count: number;
        checkin: CheckInProjectionBrief;
      }>([
        {
          $match: {
            user: activity.userId,
          },
        },
        {
          $facet: {
            count: [
              {
                $count: "count",
              },
            ],
            checkin: [
              {
                $match: {
                  _id: activity.resourceId,
                },
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
                        ...PlaceProjection.detail,
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
            checkin: { $arrayElemAt: ["$checkin", 0] },
          },
        },
      ]).then((res) => res[0]);

      if (!result) {
        return [null, null, userInfo];
      }

      resourceInfo = {
        ...result.checkin,
        image: result.checkin.media?.[0],
        totalCheckins: result.count || 0,
      };
      placeInfo = resourceInfo.place;

      break;
    case ResourceTypeEnum.User:
      resourceInfo = await User.findById(activity.resourceId)
        .select<UserProjectionType["essentials"]>(UserProjection.essentials)
        .lean();

      if (activity.placeId) {
        placeInfo = await Place.findById(activity.placeId)
          .select<PlaceProjectionDetail>(PlaceProjection.detail)
          .lean();
      }

      break;
    case ResourceTypeEnum.Achievement:
      resourceInfo = await Achievement.findById(activity.resourceId).lean();
      if (activity.placeId) {
        placeInfo = await Place.findById(activity.placeId)
          .select<PlaceProjectionDetail>(PlaceProjection.detail)
          .lean();
      }
      break;
    default:
      break;
  }

  // Fix place location format
  if (placeInfo && placeInfo.location?.geoLocation?.coordinates) {
    placeInfo.location.geoLocation = {
      lng: placeInfo.location.geoLocation.coordinates[0],
      lat: placeInfo.location.geoLocation.coordinates[1],
    };
  }

  return [resourceInfo, placeInfo, userInfo];
};

export const getUserFeed = async (
  authUserId: mongoose.Types.ObjectId,
  isForYou: boolean,
  limit: number,
  skip: number,
) => {
  try {
    const activities = [];

    const [followings, blocked] = await Promise.all([
      Follow.find({ user: authUserId }, { target: 1 }).lean(),
      Block.find({ target: authUserId }).lean(),
    ]);

    let query: FilterQuery<IUserActivity> = {};

    if (isForYou) {
      // For You activities
      query = {
        userId: {
          $nin: blocked.map((b) => b.user),
        },
        hasMedia: true,
        resourcePrivacy: { $ne: ResourcePrivacyEnum.Private },
        $or: [
          {
            isAccountPrivate: false,
          },
          {
            isAccountPrivate: true,
            userId: {
              $in: [...followings.map((f) => f.target), authUserId],
            },
          },
        ],
      };
    } else {
      // Following users' activities
      query = {
        $or: [
          {
            resourcePrivacy: { $ne: ResourcePrivacyEnum.Private },
            userId: {
              $nin: blocked.map((b) => b.user),
              $in: [...followings.map((f) => f.target), authUserId],
            },
          },
          {
            resourcePrivacy: ResourcePrivacyEnum.Private,
            userId: authUserId,
          },
        ],
      };
    }

    const sortBy: { [key: string]: SortOrder } = isForYou
      ? { hotnessScore: -1 }
      : { createdAt: -1 };

    const userActivities = await UserActivity.find(query)
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean();

    for (const activity of userActivities) {
      const [resourceInfo, placeInfo, userInfo] = await getResourceInfo(
        activity,
        authUserId,
      );

      if (!resourceInfo) continue;

      // const seen: IActivitySeen | null = await ActivitySeen.findOne(
      //   {
      //     subjectId: _act.userId,
      //     observerId: userId,
      //     activityId: _act._id,
      //   },
      //   {
      //     weight: 1,
      //   }
      // ).lean();

      // const score = await calculateScore(
      //   userId,
      //   _act.userId,
      //   _act as IUserActivity,
      //   placeInfo,
      //   location && location
      // );

      // const weight = seen ? seen.weight + 1 : 1;

      const [reactions, comments, commentsCount] = await Promise.all([
        getReactionsOfActivity(activity._id, authUserId),
        getCommentsOfActivity(activity._id, authUserId),
        Comment.countDocuments({
          userActivity: activity._id,
        }),
      ]);

      activities.push({
        _id: activity._id,
        user: userInfo,
        place: placeInfo,
        activityType: activity.activityType,
        resourceType: activity.resourceType,
        resource: resourceInfo,
        privacyType: "PUBLIC", // TODO: remove on next update
        resourcePrivacy: activity.resourcePrivacy,
        isAccountPrivate: activity.isAccountPrivate,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
        reactions: reactions[0],
        comments: comments,
        commentsCount,
      });
    }

    // TODO: strategy: once all unseen activities are exhausted, retrieve previously seen activities

    return activities;
  } catch (e) {
    logger.error(`Error happened with this description: ${e}`);
    return [];
  }
};
