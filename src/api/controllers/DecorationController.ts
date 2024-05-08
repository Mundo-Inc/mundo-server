import type { NextFunction, Request, Response } from "express";
import { param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import {
  ProfileCover,
  ProfileFrame,
  type IProfileCover,
  type IProfileFrame,
} from "../../models/ProfileDecoration";
import ProfileDecorationRedemption, {
  ProfileDecorationEnum,
} from "../../models/ProfileDecorationRedemption";
import User, { type IUser } from "../../models/User";
import strings, { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";

export const getDecorationsValidation: ValidationChain[] = [];

export async function getDecorations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const user: IUser | null = await User.findById(authId);
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }
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

export const getDecorationRedemptionValidation: ValidationChain[] = [];

export async function getDecorationRedemption(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const user: IUser | null = await User.findById(authId);
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }
    const decorationRedemptions = await ProfileDecorationRedemption.find({
      userId: user._id,
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
    const { id: authId } = req.user!;
    const { id, type } = req.params;
    const user: IUser | null = await User.findById(authId);
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }

    let decoration: IProfileCover | IProfileFrame | null = null;

    if (type === ProfileDecorationEnum.PROFILE_COVER) {
      const cover: IProfileCover | null = await ProfileCover.findById(id);
      decoration = cover;
    } else if (type === ProfileDecorationEnum.PROFILE_FRAME) {
      const frame: IProfileFrame | null = await ProfileFrame.findById(id);
      decoration = frame;
    }

    if (!decoration) {
      throw createError("decoration not found", StatusCodes.NOT_FOUND);
    }

    if (
      !user.phantomCoins.balance ||
      user.phantomCoins.balance < decoration.price
    ) {
      throw createError("insufficient balance", StatusCodes.BAD_REQUEST);
    }

    const alreadyBought = await ProfileDecorationRedemption.findOne({
      userId: user._id,
      decorationId: decoration._id,
      decorationType: type,
    });

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

    await profileDecorationRedemption.save();

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
    const { id: authId } = req.user!;
    const { id, type } = req.params;
    const user: IUser | null = await User.findById(authId);
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }

    const alreadyBought = await ProfileDecorationRedemption.findOne({
      userId: user._id,
      decorationId: id,
      decorationType: type,
    });

    if (!alreadyBought) {
      throw createError(
        "you have not redeemed this decoration before",
        StatusCodes.BAD_REQUEST
      );
    }

    if (type === ProfileDecorationEnum.PROFILE_COVER) {
      const cover: IProfileCover | null = await ProfileCover.findById(id);
      if (!cover) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Cover"),
          StatusCodes.NOT_FOUND
        );
      }
      user.decorations.cover = cover.url;
    } else if (type === ProfileDecorationEnum.PROFILE_FRAME) {
      const frame: IProfileFrame | null = await ProfileFrame.findById(id);
      if (!frame) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Frame"),
          StatusCodes.NOT_FOUND
        );
      }
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
    const { id: authId } = req.user!;
    const { id, type } = req.params;
    const user: IUser | null = await User.findById(authId);
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }
    const alreadyBought = await ProfileDecorationRedemption.findOne({
      userId: user._id,
      decorationId: id,
      decorationType: type,
    });

    if (!alreadyBought) {
      throw createError(
        "you have not redeemed this decoration before",
        StatusCodes.BAD_REQUEST
      );
    }

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
