import type { NextFunction, Request, Response } from "express";
import { ValidationChain, param } from "express-validator";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";

import Block from "../../models/Block.js";
import User from "../../models/User.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";

export const blockValidation: ValidationChain[] = [param("id").isMongoId()];

export async function block(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new Types.ObjectId(req.params.id);

    const block = await Block.findOne({ user: authUser._id, target: id });

    if (block) {
      throw createError(
        dynamicMessage(dStrings.alreadyExists, "Document"),
        StatusCodes.CONFLICT
      );
    }

    await User.exists({ _id: id }).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    await Block.create({
      user: authUser._id,
      target: id,
    });

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export async function unblock(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new Types.ObjectId(req.params.id);

    const block = await Block.findOne({
      user: authUser._id,
      target: id,
    }).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "Document"),
        StatusCodes.NOT_FOUND
      )
    );

    await block.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (error) {
    next(error);
  }
}
