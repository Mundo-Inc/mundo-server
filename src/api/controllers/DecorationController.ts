import type { NextFunction, Request, Response } from "express";
import { param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import {
  ProfileCover,
  ProfileFrame,
  type IProfileCover,
  type IProfileFrame,
} from "../../models/ProfileDecoration.js";
import ProfileDecorationRedemption, {
  ProfileDecorationEnum,
} from "../../models/ProfileDecorationRedemption.js";
import User from "../../models/User.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";

export async function getDecorations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const frames = await ProfileFrame.find({});
    const covers = await ProfileCover.find({});
    const decorations = {
      frames,
      covers,
    };
    res.status(StatusCodes.OK).json({
      success: true,
      data: decorations,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDecorationRedemption(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const decorationRedemptions = await ProfileDecorationRedemption.find({
      userId: authUser._id,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      data: decorationRedemptions,
    });
  } catch (error) {
    next(error);
  }
}

export const redeemDecorationValidation: ValidationChain[] = [
  param("type").isIn(Object.values(ProfileDecorationEnum)),
  param("id").isMongoId(),
];

export async function redeemDecoration(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const authUser = req.user!;

    const type = req.params.type as ProfileDecorationEnum;
    const id = new mongoose.Types.ObjectId(req.params.id);

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    let decoration: IProfileCover | IProfileFrame | null = null;

    if (type === ProfileDecorationEnum.PROFILE_COVER) {
      const cover = await ProfileCover.findById(id).orFail(
        createError("decoration not found", StatusCodes.NOT_FOUND)
      );
      decoration = cover;
    } else if (type === ProfileDecorationEnum.PROFILE_FRAME) {
      const frame = await ProfileFrame.findById(id).orFail(
        createError("decoration not found", StatusCodes.NOT_FOUND)
      );
      decoration = frame;
    } else {
      throw createError("decoration not found", StatusCodes.NOT_FOUND);
    }

    if (
      !user.phantomCoins.balance ||
      user.phantomCoins.balance < decoration.price
    ) {
      throw createError("insufficient balance", StatusCodes.BAD_REQUEST);
    }

    const alreadyBought = await ProfileDecorationRedemption.exists({
      userId: user._id,
      decorationId: decoration._id,
      decorationType: type,
    }).then((exists) => Boolean(exists));

    if (alreadyBought) {
      throw createError(
        "you have already redeemed this decoration",
        StatusCodes.BAD_REQUEST
      );
    }

    user.phantomCoins.balance = user.phantomCoins.balance - decoration.price;
    await user.save();

    const profileDecorationRedemption =
      await ProfileDecorationRedemption.create({
        userId: user._id,
        decorationId: decoration._id,
        decorationType: type,
      });

    //TODO: notify them that they redemption is in verification progress

    res.status(StatusCodes.OK).json({
      success: true,
      data: profileDecorationRedemption,
    });
  } catch (error) {
    next(error);
  }
}

export const activateDecorationValidation: ValidationChain[] = [
  param("type").isIn(Object.values(ProfileDecorationEnum)),
  param("id").isMongoId(),
];

export async function activateDecoration(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const type = req.params.type as ProfileDecorationEnum;
    const id = new mongoose.Types.ObjectId(req.params.id);

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    await ProfileDecorationRedemption.exists({
      userId: user._id,
      decorationId: id,
      decorationType: type,
    }).orFail(
      createError(
        "you have not redeemed this decoration before",
        StatusCodes.BAD_REQUEST
      )
    );

    if (type === ProfileDecorationEnum.PROFILE_COVER) {
      const cover = await ProfileCover.findById(id).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Cover"),
          StatusCodes.NOT_FOUND
        )
      );
      user.decorations.cover = cover.url;
    } else if (type === ProfileDecorationEnum.PROFILE_FRAME) {
      const frame = await ProfileFrame.findById(id).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Frame"),
          StatusCodes.NOT_FOUND
        )
      );
      user.decorations.frame = frame.url;
    }

    await user.save();

    res.status(StatusCodes.OK).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

export const deactivateDecorationValidation: ValidationChain[] = [
  param("type").isIn(Object.values(ProfileDecorationEnum)),
  param("id").isMongoId(),
];

export async function deactivateDecoration(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const type = req.params.type as ProfileDecorationEnum;
    const id = new mongoose.Types.ObjectId(req.params.id);

    const user = await User.findById(authUser._id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    await ProfileDecorationRedemption.exists({
      userId: user._id,
      decorationId: id,
      decorationType: type,
    }).orFail(
      createError(
        "you have not redeemed this decoration before",
        StatusCodes.BAD_REQUEST
      )
    );

    if (type === ProfileDecorationEnum.PROFILE_COVER) {
      user.decorations.cover = undefined;
    } else if (type === ProfileDecorationEnum.PROFILE_FRAME) {
      user.decorations.frame = undefined;
    }

    await user.save();

    res.status(StatusCodes.OK).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
