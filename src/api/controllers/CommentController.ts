import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Comment, { type IComment } from "../../models/Comment";
import User from "../../models/User";
import UserActivity from "../../models/UserActivity";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserProjection } from "../dto/user/read-user-public.dto";
import { addReward } from "../services/reward/reward.service";

export const createCommentValidation: ValidationChain[] = [
  body("content").isString().isLength({ min: 1, max: 250 }),
  body("activity").isMongoId().withMessage("Invalid activity id"),
];
export async function createComment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { content, activity } = req.body;
    const { id: authId } = req.user!;

    const user = await User.findById(authId, publicReadUserProjection).populate(
      "progress.achievements"
    );
    if (!user) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    await UserActivity.findById(activity).then((userActivity) => {
      if (!userActivity) {
        throw createError(
          dynamicMessage(ds.notFound, "Activity"),
          StatusCodes.NOT_FOUND
        );
      }
    });

    const body: {
      [key: string]: any;
    } = {
      author: authId,
      userActivity: activity,
      content,
    };

    // extract mentions
    const mentions = content.match(/@(\w+)/g);

    if (mentions) {
      const toAdd: {
        user: string;
        username: string;
      }[] = [];

      for (const mention of mentions) {
        if (toAdd.find((a) => a.user === mention)) {
          continue;
        }

        const user = await User.findOne(
          {
            username: new RegExp(`^${mention.slice(1)}$`, "i"),
          },
          ["_id", "username"]
        );

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

    let commentObj = comment.toObject();

    // update comments count in user activity
    await UserActivity.updateOne(
      { _id: activity },
      { $inc: { "engagements.comments": 1 } }
    );

    // adding reward
    const reward = await addReward(user._id, {
      refType: "Comment",
      refId: comment._id,
      userActivityId: activity,
    });
    commentObj.author = user;
    commentObj.likes = 0;
    commentObj.liked = false;
    commentObj.status = undefined;
    res
      .status(StatusCodes.CREATED)
      .json({ success: true, data: commentObj, reward: reward });
  } catch (err) {
    next(err);
  }
}

export const likeCommentValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid comment id"),
];
export async function likeComment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { id } = req.params;

    const comment: IComment | null = await Comment.findById(id);
    if (!comment) {
      throw createError(
        dynamicMessage(ds.notFound, "Comment"),
        StatusCodes.NOT_FOUND
      );
    }

    if (comment.likes.find((l: any) => l.toString() === authId)) {
      throw createError(strings.comments.alreadyLiked, StatusCodes.CONFLICT);
    }

    comment.likes.push(new mongoose.Types.ObjectId(authId));
    await comment.save();

    await comment.populate({
      path: "author",
      select: publicReadUserProjection,
      populate: {
        path: "progress.achievements",
      },
    });

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        _id: comment._id,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        content: comment.content,
        mentions: comment.mentions,
        author: comment.author,
        likes: comment.likes.length,
        liked: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

export const deleteCommentLikeValidation: ValidationChain[] = [
  param("id").isMongoId().withMessage("Invalid comment id"),
];
export async function deleteCommentLike(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { id } = req.params;

    const comment: IComment | null = await Comment.findById(id);
    if (!comment) {
      throw createError(
        dynamicMessage(ds.notFound, "Comment"),
        StatusCodes.NOT_FOUND
      );
    }

    if (!comment.likes.find((l: any) => l.toString() === authId)) {
      throw createError(strings.comments.notLiked, StatusCodes.BAD_REQUEST);
    }

    comment.likes = comment.likes.filter((l: any) => l.toString() !== authId);
    await comment.save();

    await comment.populate({
      path: "author",
      select: publicReadUserProjection,
      populate: {
        path: "progress.achievements",
      },
    });

    // update comments count in user activity
    await UserActivity.updateOne(
      { _id: comment.userActivity },
      { $inc: { "engagements.comments": -1 } }
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: {
        _id: comment._id,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        content: comment.content,
        mentions: comment.mentions,
        author: comment.author,
        likes: comment.likes.length,
        liked: false,
      },
    });
  } catch (err) {
    next(err);
  }
}
