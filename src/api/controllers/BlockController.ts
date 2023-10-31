import {
  calcLevel,
  calcRemainingXP,
  calcReviewReward,
} from "./../services/reward/helpers/levelCalculations";
import type { NextFunction, Request, Response } from "express";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import Block from "../../models/Block";
import strings from "../../strings";
import { StatusCodes } from "http-status-codes";
import { ValidationChain, param } from "express-validator";
import User from "../../models/User";

export const blockValidation: ValidationChain[] = [param("id").isMongoId()];

export async function block(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);
    const { id } = req.params;
    const { id: authId } = req.user!;

    let block = await Block.findOne({ user: authId, target: id });
    if (block)
      throw createError(strings.blocks.alreadyExists, StatusCodes.CONFLICT);

    const userTarget = User.findById(id);
    if (!userTarget)
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);

    block = await Block.create({
      user: authId,
      target: id,
    });
    res.status(StatusCodes.CREATED).json({ success: true, data: block });
  } catch (err) {
    next(err);
  }
}

export async function unblock(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);
    const { id } = req.params;
    const { id: authId } = req.user!;
    let block = await Block.findOne({ user: authId, target: id });
    if (!block)
      throw createError(strings.blocks.notFound, StatusCodes.NOT_FOUND);
    await block.deleteOne();
    res.status(StatusCodes.NO_CONTENT).json({ success: true });
  } catch (error) {
    next(error);
  }
}
