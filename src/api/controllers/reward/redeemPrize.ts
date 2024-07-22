import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { BrevoService } from "../../../api/services/BrevoService.js";
import logger from "../../../api/services/logger/index.js";
import type { IPrize } from "../../../models/Prize.js";
import Prize from "../../../models/Prize.js";
import PrizeRedemption from "../../../models/PrizeRedemption.js";
import type { IUser } from "../../../models/User.js";
import User from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const redeemPrizeValidation = validateData({
  params: params,
});

export async function redeemPrize(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const user = await User.findById(authUser._id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    const prize = await Prize.findById(id).orFail(
      createError("prize not found", StatusCodes.NOT_FOUND),
    );

    if (prize.count <= 0) {
      throw createError("prize was finished", StatusCodes.BAD_REQUEST);
    }

    if (
      !user.phantomCoins.balance ||
      user.phantomCoins.balance < prize.amount
    ) {
      throw createError("insufficient balance", StatusCodes.BAD_REQUEST);
    }

    user.phantomCoins.balance = user.phantomCoins.balance - prize.amount;
    await user.save();

    prize.count = prize.count - 1;
    await prize.save();

    const prizeRedemption = await PrizeRedemption.create({
      userId: user._id,
      prizeId: prize._id,
    });

    await prizeRedemption.save();

    // notify them that they redemption is in verification progress
    await notifyRedemptionInProgress(user, prize);

    res.status(StatusCodes.OK).json(createResponse(prizeRedemption));
  } catch (error) {
    next(error);
  }
}

async function notifyRedemptionInProgress(user: IUser, prize: IPrize) {
  try {
    // Sending email notification
    const receivers = [{ email: user.email.address }];
    const sender = { email: "admin@phantomphood.com", name: "Phantom Phood" };
    const subject = "PhantomPhood - Prize Redemption";
    const brevoService = new BrevoService();
    const prizeTitle = prize.title;
    const prizeAmount = prize.amount;
    const name = user.name;
    await brevoService.sendTemplateEmail(
      receivers,
      subject,
      sender,
      "redemption-in-progress.handlebars",
      {
        name,
        prizeTitle,
        prizeAmount,
      },
    );
  } catch (error) {
    logger.error("error while sending email for redemption");
  }
}
