import mongoose, { type FilterQuery, type SortOrder } from "mongoose";

import Achievement from "../../models/Achievement";
import ActivitySeen, { type IActivitySeen } from "../../models/ActivitySeen";
import Block, { type IBlock } from "../../models/Block";
import CheckIn from "../../models/CheckIn";
import Comment from "../../models/Comment";
import Deal from "../../models/Deal";
import Follow, { type IFollow } from "../../models/Follow";
import Place, { type IPlace } from "../../models/Place";
import Reaction from "../../models/Reaction";
import Review from "../../models/Review";
import User from "../../models/User";
import UserActivity, {
  ActivityPrivacyTypeEnum,
  ActivityResourceTypeEnum,
  type IUserActivity,
} from "../../models/UserActivity";
import { readFormattedPlaceLocationProjection } from "../dto/place/place-dto";
import { readPlaceDetailProjection } from "../dto/place/read-place-detail.dto";
import { publicReadUserEssentialProjection } from "../dto/user/read-user-public.dto";
import logger from "./logger";

export type IMedia = {
  _id: string;
  src: string;
  caption: string;
  type: "image" | "video";
};
export interface IPlaceReview {
  _id: string;
  scores: {
    overall: number;
    drinkQuality: number;
    foodQuality: number;
    atmosphere: number;
    service: number;
    value: number;
  };
  content: string;
  images: IMedia[];
  videos: IMedia[];
  reactions: {
    like: number;
    dislike: number;
  };
  tags: string[];
  language: string;
  createdAt: string;
  updatedAt: string;
  userReaction?: "like" | "dislike" | undefined;
  writer: {
    _id: string;
    name: string;
    username: string;
    profileImage: string;
    level: number;
  };
}
export interface IPlaceData {
  _id: string;
  name: string;
  thumbnail: string;
  images: string[];
  description: string;
  reviewCount: number;
  location: {
    geoLocation: {
      lng: number;
      lat: number;
    };
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
  };
  phone?: string | null;
  website?: string | null;
  categories?: string[];
  owner?: string | null;
  priceRange?: number;
  scores: {
    overall?: number;
    drinkQuality?: number;
    foodQuality?: number;
    atmosphere?: number;
    service?: number;
    value?: number;
    phantom?: number;
  };
  reviews: IPlaceReview[];
  // phantomScore?: number;
  distance?: number;
}

export const getResourceInfo = async (activity: IUserActivity) => {
  let resourceInfo: any;
  let placeInfo: any;
  const userInfo = await User.findOne(
    { _id: activity.userId },
    publicReadUserEssentialProjection
  ).lean();
  if (activity.resourceType === ActivityResourceTypeEnum.PLACE) {
    resourceInfo = await Place.findById(
      activity.resourceId,
      readPlaceDetailProjection
    ).lean();

    // TODO: remove after force update
    if (resourceInfo) {
      resourceInfo.reviewCount = resourceInfo.activities?.reviewCount || 0;
    }

    placeInfo = resourceInfo;
  } else if (activity.resourceType === ActivityResourceTypeEnum.REVIEW) {
    const reviews = await Review.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(activity.resourceId),
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
              $project: publicReadUserEssentialProjection,
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
                ...readPlaceDetailProjection,
                location: readFormattedPlaceLocationProjection,
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

    // TODO: remove after force update
    if (reviews[0] && reviews[0].place) {
      reviews[0].place.reviewCount =
        reviews[0].place.activities?.reviewCount || 0;
    }

    resourceInfo = reviews[0];
    placeInfo = resourceInfo.place;
  } else if (activity.resourceType === ActivityResourceTypeEnum.DEAL) {
    resourceInfo = await Deal.findById(activity.resourceId).lean();
    placeInfo = await Place.findById(
      resourceInfo.place,
      readPlaceDetailProjection
    ).lean();
  } else if (activity.resourceType === ActivityResourceTypeEnum.CHECKIN) {
    const checkins = await CheckIn.aggregate([
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
                _id: new mongoose.Types.ObjectId(activity.resourceId),
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
                      ...readPlaceDetailProjection,
                      location: readFormattedPlaceLocationProjection,
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
                    $project: publicReadUserEssentialProjection,
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
                user: publicReadUserEssentialProjection,
                place: readPlaceDetailProjection,
                image: { $arrayElemAt: ["$image", 0] },
                caption: 1,
                tags: 1,
              },
            },
          ],
        },
      },
    ]);

    if (!checkins[0]) return [null, null, userInfo];

    // TODO: remove after force update
    if (checkins[0] && checkins[0].place) {
      checkins[0].place.reviewCount =
        checkins[0].place.activities?.reviewCount || 0;
    }

    resourceInfo = {
      totalCheckins: checkins[0].total[0]?.total || 0,
      ...checkins[0].checkin[0],
    };
    placeInfo = resourceInfo.place;
  } else if (activity.resourceType === ActivityResourceTypeEnum.USER) {
    resourceInfo = await User.findById(
      activity.resourceId,
      publicReadUserEssentialProjection
    ).lean();
    if (activity.placeId) {
      placeInfo = await Place.findById(
        activity.placeId,
        readPlaceDetailProjection
      ).lean();

      // TODO: remove after force update
      if (placeInfo) {
        placeInfo.reviewCount = placeInfo.activities?.reviewCount || 0;
      }
    }
  } else if (activity.resourceType === ActivityResourceTypeEnum.ACHIEVEMET) {
    resourceInfo = await Achievement.findById(activity.resourceId);
    if (activity.placeId) {
      placeInfo = await Place.findById(
        activity.placeId,
        readPlaceDetailProjection
      ).lean();

      // TODO: remove after force update
      if (placeInfo) {
        placeInfo.reviewCount = placeInfo.activities?.reviewCount || 0;
      }
    }
  }

  // Fix place location format
  if (placeInfo) {
    if (placeInfo.location?.geoLocation?.coordinates) {
      placeInfo.location.geoLocation = {
        lng: placeInfo.location.geoLocation.coordinates[0],
        lat: placeInfo.location.geoLocation.coordinates[1],
      };
    }
  }

  return [resourceInfo, placeInfo, userInfo];
};

// define the Haversine formula
const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const rad = Math.PI / 180;
  const R = 6371; // earth radius in km

  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

function getLatLng(place: IPlace | IPlaceData) {
  if ("coordinates" in place.location.geoLocation) {
    return {
      lat: place.location.geoLocation.coordinates[1],
      lng: place.location.geoLocation.coordinates[0],
    };
  } else {
    return {
      lat: place.location.geoLocation.lat,
      lng: place.location.geoLocation.lng,
    };
  }
}

// define the calculateDistance method
const calculateDistance = async (
  place1: IPlace | IPlaceData,
  place2: IPlace | IPlaceData
): Promise<number> => {
  const { lat: lat1, lng: lon1 } = getLatLng(place1);
  const { lat: lat2, lng: lon2 } = getLatLng(place2);

  return haversine(lat1, lon1, lat2, lon2);
};

const calculateScore = async (
  userId: string,
  targetId: string,
  activity: IUserActivity,
  place: IPlace,
  location?: {
    lng: number;
    lat: number;
  }
) => {
  const TIME_WEIGHT = 0.5;
  const DISTANCE_WEIGHT = 0.3;
  const FOLLOWING_WEIGHT = 0.1;
  const FOLLOWER_WEIGHT = 0.1;

  const user = await User.findById(userId);

  let distanceScore;
  if (location && place) {
    const { lat: lat2, lng: lon2 } = getLatLng(place);
    distanceScore =
      1 / Math.max(haversine(location.lat, location.lng, lat2, lon2), 0.000001);
  } else if (user.latestPlace && place) {
    const userPlace = await Place.findById(user.latestPlace);
    distanceScore =
      1 / Math.max(await calculateDistance(userPlace, place), 0.000001);
  } else {
    distanceScore = 0.000001;
  }

  let followingScore = 0;
  const followingStatus = await Follow.findOne({
    user: userId,
    target: targetId,
  });
  if (followingStatus) {
    followingScore = 1;
  }

  let followerScore = 0;
  const followerStatus = await Follow.find({ user: targetId, target: userId });
  if (followerStatus) {
    followerScore = 1;
  }

  let timeScore =
    (new Date().getTime() - activity.createdAt.getTime()) / 3600 / 1000;

  timeScore *= TIME_WEIGHT;
  distanceScore *= DISTANCE_WEIGHT;
  followingScore *= FOLLOWING_WEIGHT;
  followerScore *= FOLLOWER_WEIGHT;

  const finalScore = timeScore + distanceScore + followingScore + followerScore;

  return finalScore;
};

export const getUserFeed = async (
  userId: string,
  isForYou: boolean = false,
  page: number = 1,
  limit: number = 20,
  location?: {
    lng: number;
    lat: number;
  }
) => {
  try {
    const followings: FilterQuery<IFollow> = await Follow.find(
      {
        user: userId,
      },
      {
        target: 1,
      }
    ).lean();

    const blocked: FilterQuery<IBlock> = await Block.find({
      target: userId,
    });

    const activities = [];
    const skip = (page - 1) * limit;

    let query: object = {
      userId: {
        $nin: blocked.map((b: IBlock) => b.user),
        $in: [
          ...followings.map((f: IFollow) => f.target),
          new mongoose.Types.ObjectId(userId),
        ],
      },
    };

    if (isForYou) {
      query = {
        userId: {
          $nin: blocked.map((b: IBlock) => b.user),
        },
        hasMedia: true,
        // Either should be public or it should be followed by the viewer or be the viewer's itself
        $or: [
          { privacyType: ActivityPrivacyTypeEnum.PUBLIC },
          {
            userId: {
              $in: [
                ...followings.map((f: IFollow) => f.target),
                new mongoose.Types.ObjectId(userId),
              ],
            },
          },
        ],
      };
    }

    let sortBy: { [key: string]: SortOrder } = { createdAt: -1 };
    if (isForYou) sortBy = { hotnessScore: -1 };

    const userActivities = UserActivity.find(query)
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean();

    for await (const _act of userActivities) {
      const seen: FilterQuery<IActivitySeen> | null =
        await ActivitySeen.findOne(
          {
            subjectId: _act.userId,
            observerId: userId,
            activityId: _act._id,
          },
          {
            weight: 1,
          }
        ).lean();

      const [resourceInfo, placeInfo, userInfo] = await getResourceInfo(_act);
      if (!resourceInfo) continue;
      const score = await calculateScore(
        userId,
        _act.userId,
        _act,
        placeInfo,
        location && location
      );

      const weight = seen ? seen.weight + 1 : 1;

      const reactions = await Reaction.aggregate([
        {
          $match: {
            target: _act._id,
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
                  user: new mongoose.Types.ObjectId(userId),
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
      ]);

      const comments = await Comment.aggregate([
        {
          $match: {
            userActivity: _act._id,
          },
        },
        {
          $limit: 3,
        },
        {
          $lookup: {
            from: "users",
            localField: "author",
            foreignField: "_id",
            as: "author",
            pipeline: [
              {
                $project: publicReadUserEssentialProjection,
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
            mentions: 1,
            author: { $arrayElemAt: ["$author", 0] },
            likes: { $size: "$likes" },
            liked: {
              $in: [new mongoose.Types.ObjectId(userId), "$likes"],
            },
          },
        },
      ]);

      const commentsCount = await Comment.countDocuments({
        userActivity: _act._id,
      });

      activities.push({
        id: _act._id,
        user: userInfo,
        place: placeInfo,
        activityType: _act.activityType,
        resourceType: _act.resourceType,
        resource: resourceInfo,
        privacyType: _act.privacyType,
        createdAt: _act.createdAt,
        updatedAt: _act.updatedAt,
        score,
        weight,
        reactions: reactions[0],
        comments: comments,
        commentsCount,
      });
    }

    // strategy when once all unseen activities are exhausted, retrieve previously seen activities
    if (activities.length === 0) {
      logger.info("No recent activities found");
    }

    return activities;
  } catch (e) {
    logger.error(`Error happened with this description: ${e}`);
  }
};
