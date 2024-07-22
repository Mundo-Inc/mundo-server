import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { handleSignUp } from "../../../api/lib/profile-handlers.js";
import { BrevoService } from "../../../api/services/BrevoService.js";
import logger from "../../../api/services/logger/index.js";
import { MundoApp } from "../../../config/firebase-config.js";
import CoinReward, { CoinRewardTypeEnum } from "../../../models/CoinReward.js";
import Notification, {
  NotificationTypeEnum,
} from "../../../models/Notification.js";
import type { IUser } from "../../../models/User.js";
import User, { SignupMethodEnum } from "../../../models/User.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import {
  validateData,
  zObjectId,
  zPassword,
  zPhone,
  zUsername,
} from "../../../utilities/validation.js";
import { sendSlackMessage } from "../SlackController.js";

const createUserBody = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  password: zPassword,
  username: zUsername,
  phone: zPhone.optional(),
  referrer: zObjectId.optional(),
});

type CreateUserBody = z.infer<typeof createUserBody>;

export const createUserValidation = validateData({
  body: createUserBody,
});

export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { name, username, email, password, referrer } =
      req.body as CreateUserBody;

    const existingUser = await User.exists({
      "email.address": { $regex: new RegExp(email, "i") },
    });

    if (existingUser) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "User"),
        StatusCodes.CONFLICT,
      );
    }

    if (referrer) {
      const referredBy = await User.findById(referrer).orFail(
        createError(
          dynamicMessage(ds.notFound, "Referrer"),
          StatusCodes.NOT_FOUND,
        ),
      );
      const amount = 250;
      referredBy.phantomCoins.balance += amount;
      await referredBy.save();
      await CoinReward.create({
        userId: referredBy._id,
        amount: amount,
        coinRewardType: CoinRewardTypeEnum.Referral,
      });

      await notifyReferrer(referredBy, name, amount);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await handleSignUp(
      email.toLowerCase(),
      name,
      username,
      SignupMethodEnum.Traditional,
      hashedPassword,
    );

    if (referrer) {
      newUser.referredBy = referrer;
    }

    newUser.accepted_eula = new Date();
    await newUser.save();

    await getAuth(MundoApp).createUser({
      uid: newUser._id.toString(),
      email: email.toLowerCase(),
      emailVerified: false,
      password: password,
      disabled: false,
    });

    try {
      sendSlackMessage(
        "phantomAssistant",
        `New user: ${newUser.name || "- - -"}\n${newUser.username} (${
          newUser.email.address
        })`,
      );
    } catch (error) {
      logger.error("Error sending slack message", { error });
    }

    res.sendStatus(StatusCodes.CREATED);
  } catch (err) {
    next(err);
  }
}

async function notifyReferrer(
  referredBy: IUser,
  newUserName: string,
  amount: number,
) {
  try {
    // Sending app notification
    await Notification.create({
      user: referredBy._id,
      type: NotificationTypeEnum.ReferralReward,
      additionalData: {
        amount,
        newUserName,
      },
      importance: 2,
    });

    // Sending email notification
    const receivers = [{ email: referredBy.email.address }];
    const sender = { email: "admin@phantomphood.com", name: "Phantom Phood" };
    const subject = "PhantomPhood - Referral Reward";
    const brevoService = new BrevoService();
    const referredByName = referredBy.name;

    await brevoService.sendTemplateEmail(
      receivers,
      subject,
      sender,
      "referral-reward.handlebars",
      {
        referredByName,
        newUserName,
        amount,
      },
    );
  } catch (error) {
    logger.error(error);

    logger.error(
      referredBy.email.address,
      referredBy.name,
      amount,
      newUserName,
    );
  }
}
