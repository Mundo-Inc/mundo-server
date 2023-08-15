import type { NextFunction, Request, Response } from "express";
import { body, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Comment from "../../models/Comment";
import User from "../../models/User";
import UserActivity from "../../models/UserActivity";
import { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { publicReadUserProjection } from "../dto/user/read-user-public.dto";

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

    const user = await User.findById(authId, publicReadUserProjection);
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

    comment.author = user;
    comment.status = undefined;

    res.status(StatusCodes.CREATED).json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
}
