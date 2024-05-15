import mongoose, { type FilterQuery, type SortOrder } from "mongoose";

import Achievement from "../../models/Achievement";
import Block from "../../models/Block";
import CheckIn from "../../models/CheckIn";
import Comment from "../../models/Comment";
import Follow from "../../models/Follow";
import Homemade from "../../models/Homemade";
import Place from "../../models/Place";
import Review from "../../models/Review";
import User from "../../models/User";
import UserActivity, {
  ActivityResourceTypeEnum,
  ResourcePrivacyEnum,
  type IUserActivity,
} from "../../models/UserActivity";
import {
  getCommentsOfActivity,
  getReactionsOfActivity,
} from "../controllers/UserActivityController";
import PlaceProjection, { type PlaceProjectionDetail } from "../dto/place";
import UserProjection, { type UserProjectionEssentials } from "../dto/user";
import logger from "./logger";

export const getResourceInfo = async (activity: IUserActivity) => {
  let resourceInfo: any;
  let placeInfo: any;

  const userInfo = await User.findOne({ _id: activity.userId })
    .select<UserProjectionEssentials>(UserProjection.essentials)
    .lean();

  switch (activity.resourceType) {
    case ActivityResourceTypeEnum.PLACE:
      resourceInfo = await Place.findById(activity.resourceId)
        .select<PlaceProjectionDetail>(PlaceProjection.detail)
        .lean();

      placeInfo = resourceInfo;
      break;
    case ActivityResourceTypeEnum.REVIEW:
      const reviews = await Review.aggregate([
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
            localField: "images",
            foreignField: "_id",
            as: "images",
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
            from: "media",
            localField: "videos",
            foreignField: "_id",
            as: "videos",
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
            images: 1,
            videos: 1,
            scores: 1,
            tags: 1,
            userActivityId: 1,
            reactions: {
              $arrayElemAt: ["$reactions", 0],
            },
          },
        },
      ]);

      resourceInfo = reviews[0];
      placeInfo = resourceInfo.place;
      break;
    case ActivityResourceTypeEnum.HOMEMADE:
      const homemade = await Homemade.aggregate([
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
            scores: 1,
            tags: 1,
            userActivityId: 1,
            reactions: {
              $arrayElemAt: ["$reactions", 0],
            },
          },
        },
      ]);
      resourceInfo = homemade[0];
      break;
    case ActivityResourceTypeEnum.CHECKIN:
      const result = await CheckIn.aggregate([
        {
          $match: {
            user: activity.userId,
          },
        },
        {
          $facet: {
            total: [
              {
                $count: "total",
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
                $unwind: "$user",
              },
              {
                $unwind: "$place",
              },
              {
                $project: {
                  _id: 1,
                  createdAt: 1,
                  user: UserProjection.essentials,
                  place: PlaceProjection.detail,
                  image: { $arrayElemAt: ["$image", 0] },
                  caption: 1,
                  tags: 1,
                },
              },
            ],
          },
        },
      ]).then((res) => res[0]);

      if (!result) {
        return [null, null, userInfo];
      }

      resourceInfo = {
        totalCheckins: result.total[0]?.total || 0,
        ...result.checkin[0],
      };
      placeInfo = resourceInfo.place;
      break;
    case ActivityResourceTypeEnum.USER:
      resourceInfo = await User.findById(
        activity.resourceId,
        UserProjection.essentials
      ).lean();
      if (activity.placeId) {
        placeInfo = await Place.findById(activity.placeId)
          .select<PlaceProjectionDetail>(PlaceProjection.detail)
          .lean();
      }
      break;
    case ActivityResourceTypeEnum.ACHIEVEMET:
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
  userId: mongoose.Types.ObjectId,
  isForYou: boolean,
  limit: number,
  skip: number
) => {
  try {
    const activities = [];

    const [followings, blocked] = await Promise.all([
      Follow.find({ user: userId }, { target: 1 }).lean(),
      Block.find({ target: userId }).lean(),
    ]);

    let query: FilterQuery<IUserActivity> = {};

    if (isForYou) {
      // For You activities
      query = {
        userId: {
          $nin: blocked.map((b) => b.user),
        },
        hasMedia: true,
        resourcePrivacy: { $ne: ResourcePrivacyEnum.PRIVATE },
        $or: [
          {
            isAccountPrivate: false,
          },
          {
            isAccountPrivate: true,
            userId: {
              $in: [...followings.map((f) => f.target), userId],
            },
          },
        ],
      };
    } else {
      // Following users' activities
      query = {
        $or: [
          {
            resourcePrivacy: { $ne: ResourcePrivacyEnum.PRIVATE },
            userId: {
              $nin: blocked.map((b) => b.user),
              $in: [...followings.map((f) => f.target), userId],
            },
          },
          {
            resourcePrivacy: ResourcePrivacyEnum.PRIVATE,
            userId: userId,
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
        activity
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
        getReactionsOfActivity(activity._id, userId),
        getCommentsOfActivity(activity._id, userId),
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
