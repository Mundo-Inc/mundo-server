import type { NextFunction, Request, Response } from "express";
import { ValidationChain, param } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Block from "../../models/Block";
import User from "../../models/User";
import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";

export const blockValidation: ValidationChain[] = [param("id").isMongoId()];

export async function block(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);
    const { id } = req.params;
    const authUser = req.user!;

    let block = await Block.findOne({ user: authUser._id, target: id });
    if (block) {
      throw createError(strings.blocks.alreadyExists, StatusCodes.CONFLICT);
    }

    const userTarget = User.findById(id);
    if (!userTarget) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }

    block = await Block.create({
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
    const { id } = req.params;
    const authUser = req.user!;

    const block = await Block.findOne({ user: authUser._id, target: id });
    if (!block) {
      throw createError(strings.blocks.notFound, StatusCodes.NOT_FOUND);
    }
    await block.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (error) {
    next(error);
  }
}
