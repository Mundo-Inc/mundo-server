import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import CoinReward, { CoinRewardTypeEnum } from "../../../models/CoinReward.js";
import User, { UserRoleEnum } from "../../../models/User.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import S3Manager from "../../../utilities/S3Manager/index.js";
import {
  validateData,
  zObjectId,
  zUsername,
} from "../../../utilities/validation.js";

const edutUserParams = z.object({
  id: zObjectId,
});

const editUserBody = z.object({
  name: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  username: zUsername.optional(),
  eula: z.boolean().optional(),
  referrer: zObjectId.optional(),
  removeProfileImage: z.boolean().optional(),
});

type EditUserParams = z.infer<typeof edutUserParams>;
type EditUserBody = z.infer<typeof editUserBody>;

export const editUserValidation = validateData({
  params: edutUserParams,
  body: editUserBody,
});

export async function editUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as EditUserParams;

    if (!authUser._id.equals(id) && authUser.role !== UserRoleEnum.Admin) {
      throw createError(
        strings.authorization.accessDenied,
        StatusCodes.FORBIDDEN,
      );
    }

    const user = await User.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
    );

    const { name, bio, username, removeProfileImage, eula, referrer } =
      req.body as EditUserBody;

    if (referrer) {
      if (user.accepted_eula) {
        throw createError(
          "Cannot set referrer after signing up",
          StatusCodes.BAD_REQUEST,
        );
      }
      if (user.referredBy) {
        throw createError("Referrer already set", StatusCodes.BAD_REQUEST);
      }
      if (!eula) {
        throw createError("EULA must be accepted", StatusCodes.BAD_REQUEST);
      }

      const referredBy = await User.findById(referrer).orFail(
        createError(
          dynamicMessage(ds.notFound, "Referrer"),
          StatusCodes.NOT_FOUND,
        ),
      );

      referredBy.phantomCoins.balance += 250;
      await referredBy.save();
      await CoinReward.create({
        userId: referredBy._id,
        amount: 250,
        coinRewardType: CoinRewardTypeEnum.Referral,
      });

      user.referredBy = referrer;
    }

    if (name) {
      user.name = name;
    }
    if (bio) {
      user.bio = bio;
    }
    if (username) {
      user.username = username;
    }
    if (eula) {
      user.accepted_eula = new Date();
    }

    if (removeProfileImage === true) {
      user.profileImage = "";
      S3Manager.deleteObject(`${id.toString()}/profile.jpg`);
    }

    try {
      await user.save();
    } catch (err: any) {
      if (err.code === 11000) {
        throw createError(strings.user.usernameTaken, StatusCodes.CONFLICT);
      }
    }

    const updatedUser: any = await User.findById(id, UserProjection.private)
      .populate("progress.achievements")
      .lean();

    const achievements: any = {};
    if (updatedUser) {
      for (const achievement of updatedUser.progress.achievements) {
        if (achievement.type in achievements) {
          achievements[achievement.type].createdAt = achievement.createdAt;
          achievements[achievement.type].count++;
        } else {
          achievements[achievement.type] = {
            _id: achievement.type,
            type: achievement.type,
            createdAt: achievement.createdAt,
            count: 1,
          };
        }
      }
    }
    updatedUser.progress.achievements = Object.values(achievements);

    res.status(StatusCodes.OK).json({
      success: true,
      data: updatedUser,
    });
  } catch (err) {
    next(err);
  }
}
