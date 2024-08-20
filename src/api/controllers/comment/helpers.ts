import type { PipelineStage, Types } from "mongoose";

import type { UserProjectionEssentials } from "../../../api/dto/user.js";
import UserProjection from "../../../api/dto/user.js";
import Comment from "../../../models/comment.js";

export async function getCommentsFromDB(
  match: PipelineStage.Match["$match"],
  sort: PipelineStage.Sort["$sort"] | undefined,
  authUserId: Types.ObjectId,
  getChildComments: boolean,
  skip?: number,
  limit?: number,
) {
  const result = await Comment.aggregate<{
    comments: {
      _id: Types.ObjectId;
      createdAt: Date;
      updatedAt: Date;
      content: string;
      mentions: {
        user: Types.ObjectId;
        username: string;
      }[];
      rootComment: Types.ObjectId | null;
      parent: Types.ObjectId | null;
      repliesCount: number;
      replies: Types.ObjectId[];
      author: UserProjectionEssentials;
      likes: number;
      liked: boolean;
    }[];
    count: number;
  }>([
    {
      $match: match,
    },
    {
      $facet: {
        comments: [
          ...(sort ? [{ $sort: sort }] : []),
          ...(skip ? [{ $skip: skip }] : []),
          ...(limit ? [{ $limit: limit }] : []),
          {
            $lookup: {
              from: "users",
              localField: "author",
              foreignField: "_id",
              as: "author",
              pipeline: [
                {
                  $project: UserProjection.essentials,
                },
              ],
            },
          },
          {
            // count children comments
            $addFields: {
              repliesCount: { $size: "$children" },
            },
          },
          {
            $project: {
              _id: 1,
              createdAt: 1,
              updatedAt: 1,
              content: 1,
              mentions: 1,
              rootComment: 1,
              parent: 1,
              repliesCount: 1,
              replies: getChildComments
                ? {
                    $slice: ["$children", 2], // limit replies to 2
                  }
                : [],
              author: { $arrayElemAt: ["$author", 0] },
              likes: { $size: "$likes" },
              liked: {
                $in: [authUserId, "$likes"],
              },
            },
          },
        ],
        count: [
          {
            $count: "count",
          },
        ],
      },
    },
    {
      $project: {
        comments: 1,
        count: { $arrayElemAt: ["$count.count", 0] },
      },
    },
  ]).then((result) => result[0]);

  return result;
}
