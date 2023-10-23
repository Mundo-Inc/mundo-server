import type { NextFunction, Request, Response } from "express";
import { ValidationChain, body, param } from "express-validator";
import Flag, { FlagTypeEnum, IFlag } from "../../models/Flag";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { StatusCodes } from "http-status-codes";
import Review from "../../models/Review";

export const createFlagValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("flagType").isIn(Object.keys(FlagTypeEnum)),
  body("note").optional().isString(),
];

export async function createFlag(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const { id } = req.params;
    const { flagType, note } = req.body;

    //check if review exists
    const reviewExists = await Review.exists({ _id: id });
    if (!reviewExists) {
      throw createError("Review not found", StatusCodes.NOT_FOUND);
    }

    const newFlag: IFlag = new Flag({
      user: authId,
      target: id,
      flagType,
      note,
    });
    await newFlag.save();
    res.status(StatusCodes.CREATED).json({ flag: newFlag }); // Send the ID of the created list as response
  } catch (err) {
    next(err);
  }
}
