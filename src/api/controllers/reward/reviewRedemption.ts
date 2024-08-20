import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import Prize from "../../../models/prize.js";
import PrizeRedemption, {
  PrizeRedemptionStatusTypeEnum,
} from "../../../models/prizeRedemption.js";
import User from "../../../models/user/user.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const body = z.object({
  validation: z.nativeEnum(PrizeRedemptionStatusTypeEnum),
  note: z.string().optional(),
});
const query = z.object({
  id: zObjectId,
});

type Body = z.infer<typeof body>;
type Query = z.infer<typeof query>;

export const reviewRedemptionValidation = validateData({
  body: body,
  query: query,
});

export async function reviewRedemption(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { validation, note } = req.body as Body;
    const { id } = req.query as unknown as Query;

    const redemption = await PrizeRedemption.findById(id).orFail(
      createError("Prize Redemption Not Found", StatusCodes.NOT_FOUND),
    );

    if (redemption.status !== PrizeRedemptionStatusTypeEnum.Pending) {
      throw createError(
        "Prize Redemption Is Already Verified as " + redemption.status,
        StatusCodes.BAD_REQUEST,
      );
    }

    const prize = await Prize.findById(redemption.prizeId).orFail(
      createError(dynamicMessage(ds.notFound, "Prize"), StatusCodes.NOT_FOUND),
    );

    const user = await User.findById(redemption.userId).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    switch (validation) {
      case PrizeRedemptionStatusTypeEnum.Successful:
        //TODO: send notification to the user that you have received the reward
        if (note) {
          redemption.note = note;
        }
        break;

      case PrizeRedemptionStatusTypeEnum.Declined:
        user.phantomCoins.balance = user.phantomCoins.balance + prize.amount;
        prize.count = prize.count + 1;
        await user.save();
        await prize.save();
        break;
    }
    redemption.status = validation;
    await redemption.save();

    res.status(StatusCodes.OK).json(createResponse(redemption));
  } catch (error) {
    next(error);
  }
}
