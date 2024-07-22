import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { AnyKeys } from "mongoose";
import { z } from "zod";

import type { UserProjectionEssentials } from "../../../api/dto/user.js";
import UserProjection from "../../../api/dto/user.js";
import { addReward } from "../../../api/services/reward/reward.service.js";
import { env } from "../../../env.js";
import type { IComment, IMention } from "../../../models/Comment.js";
import Comment from "../../../models/Comment.js";
import ScheduledTask, {
  ScheduledTaskStatus,
  ScheduledTaskType,
} from "../../../models/ScheduledTask.js";
import User from "../../../models/User.js";
import UserActivity from "../../../models/UserActivity.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { getRandomDateInRange } from "../../../utilities/dateTime.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const body = z.object({
  activity: zObjectId,
  content: z.string().min(1).max(500),
  parent: zObjectId.optional(),
});

type Body = z.infer<typeof body>;

export const createCommentValidation = validateData({
  body: body,
});

export async function createComment(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { content, activity, parent } = req.body as Body;

    const user = await User.findById(authUser._id)
      .select<UserProjectionEssentials>(UserProjection.essentials)
      .orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      )
      .lean();

    await UserActivity.exists({ _id: activity }).orFail(
      createError(
        dynamicMessage(ds.notFound, "Activity"),
        StatusCodes.NOT_FOUND,
      ),
    );

    const body: IComment | AnyKeys<IComment> = {
      author: authUser._id,
      userActivity: activity,
      content,
    };

    const parentComment =
      parent &&
      (await Comment.findById(parent).orFail(
        createError(
          dynamicMessage(ds.notFound, "Parent comment"),
          StatusCodes.NOT_FOUND,
        ),
      ));

    if (parentComment) {
      body.parent = parent;
      if (parentComment.rootComment) {
        body.rootComment = parentComment.rootComment;
      } else {
        body.rootComment = parent;
      }
    }

    // extract mentions
    const mentions = content.match(/@(\w+)/g);

    if (mentions) {
      const toAdd: IMention[] = [];

      const mentionsSet = new Set(mentions);

      for (const mention of mentionsSet) {
        const user = await User.findOne({
          username: new RegExp(`^${mention.slice(1)}$`, "i"),
        })
          .select<{
            username: string;
          }>("username")
          .lean();

        if (user) {
          toAdd.push({
            user: user._id,
            username: user.username,
          });
        }
      }

      if (toAdd.length > 0) {
        body.mentions = toAdd;
      }
    }

    const comment = await Comment.create(body);

    if (parentComment) {
      parentComment.children.push(comment._id);
      await parentComment.save();
    }

    // update comments count in user activity
    await UserActivity.updateOne(
      { _id: activity },
      { $inc: { "engagements.comments": 1 } },
    );

    // adding reward
    // TODO: Use websockets to send reward change
    const reward = await addReward(user._id, {
      refType: "Comment",
      refId: comment._id,
      userActivityId: activity,
    });

    res.status(StatusCodes.CREATED).json(
      createResponse({
        ...comment.toObject(),
        author: user,
        repliesCount: 0,
        replies: [],
        likes: 0,
        liked: false,
      }),
    );

    // AI reply
    if (parentComment && parentComment.author.equals(env.MUNDO_USER_ID)) {
      await ScheduledTask.create({
        status: ScheduledTaskStatus.Pending,
        type: ScheduledTaskType.ReplyToComment,
        resourceId: comment._id,
        scheduledAt: getRandomDateInRange(60 * 60 * 2, 60 * 5),
      });
    }
  } catch (err) {
    next(err);
  }
}
