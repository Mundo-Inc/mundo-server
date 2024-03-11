import { ValidationChain, param } from "express-validator";
import ProfileDecorationRedemption, {
  ProfileDecorationEnum,
} from "../../models/ProfileDecorationRedemption";
import { NextFunction, Request, Response } from "express";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import User, { IUser } from "../../models/User";
import strings from "../../strings";
import { StatusCodes } from "http-status-codes";
import {
  IProfileCover,
  IProfileFrame,
  ProfileFrame,
} from "../../models/ProfileDecoration";
import { ProfileCover } from "../../models/ProfileDecoration";

export const getDecorationsValidation: ValidationChain[] = [];

export async function getDecorations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const user = (await User.findById(authId)) as IUser;
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
    const user = (await User.findById(authId)) as IUser;
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
    const user = (await User.findById(authId)) as IUser;
    if (!user) {
      throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
    }

    let decoration: IProfileCover | IProfileFrame | null = null;

    if (type === ProfileDecorationEnum.PROFILE_COVER) {
      decoration = (await ProfileCover.findById(id)) as IProfileCover;
    } else if (type === ProfileDecorationEnum.PROFILE_FRAME) {
      decoration = (await ProfileFrame.findById(id)) as IProfileFrame;
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
    let user = (await User.findById(authId)) as IUser;
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
      const cover = (await ProfileCover.findById(id)) as IProfileCover;
      user.decorations.cover = cover.url;
    } else if (type === ProfileDecorationEnum.PROFILE_FRAME) {
      const frame = (await ProfileFrame.findById(id)) as IProfileFrame;
      user.decorations.frame = frame.url;
    }

    user = await user.save();

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
    let user = (await User.findById(authId)) as IUser;
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

    user = await user.save();

    res.status(StatusCodes.OK).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
