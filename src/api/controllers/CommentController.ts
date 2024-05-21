import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import Comment from "../../models/Comment.js";
import User from "../../models/User.js";
import UserActivity from "../../models/UserActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import UserProjection, { type UserProjectionEssentials } from "../dto/user.js";
import { addReward } from "../services/reward/reward.service.js";

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

    const { content } = req.body;
    const activityId = new mongoose.Types.ObjectId(req.body.activity as string);
    const authUser = req.user!;

    const user = await User.findById(authUser._id)
      .select<UserProjectionEssentials>(UserProjection.essentials)
      .orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND)
      )
      .lean();

    await UserActivity.exists({ _id: activityId }).orFail(
      createError(
        dynamicMessage(ds.notFound, "Activity"),
        StatusCodes.NOT_FOUND
      )
    );

    const body: {
      [key: string]: any;
    } = {
      author: authUser._id,
      userActivity: activityId,
      content,
    };

    // extract mentions
    const mentions = content.match(/@(\w+)/g);

    if (mentions) {
      const toAdd: {
        user: mongoose.Types.ObjectId;
        username: string;
      }[] = [];

      for (const mention of mentions) {
        if (toAdd.find((a) => a.user === mention)) {
          continue;
        }

        const user = await User.findOne({
          username: new RegExp(`^${mention.slice(1)}$`, "i"),
        }).select<{
          _id: mongoose.Types.ObjectId;
          username: string;
        }>("_id username");

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

    // update comments count in user activity
    await UserActivity.updateOne(
      { _id: activityId },
      { $inc: { "engagements.comments": 1 } }
    );

    // adding reward
    const reward = await addReward(user._id, {
      refType: "Comment",
      refId: comment._id,
      userActivityId: activityId,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: {
        ...comment.toObject(),
        author: user,
        likes: 0,
        liked: false,
        status: undefined,
      },
      reward: reward,
    });
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const comment = await Comment.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Comment"), StatusCodes.NOT_FOUND)
    );

    if (
      comment.likes.find((l: mongoose.Types.ObjectId) => authUser._id.equals(l))
    ) {
      throw createError(strings.comments.alreadyLiked, StatusCodes.CONFLICT);
    }

    comment.likes.push(authUser._id);
    await comment.save();

    await comment.populate({
      path: "author",
      select: UserProjection.essentials,
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const comment = await Comment.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "Comment"), StatusCodes.NOT_FOUND)
    );

    if (!comment.likes.some((l) => authUser._id.equals(l))) {
      throw createError(strings.comments.notLiked, StatusCodes.BAD_REQUEST);
    }

    comment.likes = comment.likes.filter((l) => !authUser._id.equals(l));

    await comment.save();

    await comment.populate({
      path: "author",
      select: UserProjection.essentials,
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
