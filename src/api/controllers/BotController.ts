import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";

import { createCron } from "../../cronjobs/bots.js";
import Bot, { IBotTargetEnum, IBotTypeEnum } from "../../models/Bot.js";
import User, { SignupMethodEnum, UserRoleEnum } from "../../models/User.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import validate from "./validators.js";

export const createBotValidation: ValidationChain[] = [
  validate.email(body("email")),
  validate.name(body("name")),
  validate.username(body("username").optional()),
];
export async function createBot(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { name, username, email } = req.body;
    let user = await User.findOne({
      "email.address": email.toLowerCase(),
    });

    if (user) {
      throw createError("User already exists", StatusCodes.CONFLICT);
    }

    if (username) {
      user = await User.findOne({
        username: username,
      });
      if (user) {
        throw createError("User already exists", StatusCodes.CONFLICT);
      }
    }
    user = await User.create({
      name,
      username: username || Math.random().toString(36).substring(2, 15),
      email: {
        address: email,
        verified: false,
      },
      role: UserRoleEnum.User,
      signupMethod: SignupMethodEnum.Bot,
      password: null,
    });

    return res.json({
      sucess: true,
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
}

export const getBotValidation: ValidationChain[] = [param("id").isMongoId()];
export async function getBot(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);

    const id = new Types.ObjectId(req.params.id);

    const bot = await User.findById(id);
    if (!bot) {
      throw createError("Bot Not Found!");
    }
    const duties = await Bot.find({
      userId: id,
    });
    return res.json({
      sucess: true,
      data: { bot, duties },
    });
  } catch (err) {
    next(err);
  }
}

export const createDutyValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("target").isIn(Object.values(IBotTargetEnum)),
  body("type").isIn(Object.values(IBotTypeEnum)),
  body("targetThresholdHours").optional().isNumeric(),
  body("interval").isString(),
  body("reactions").optional().isArray(),
  body("reactions.*").optional().isString(),
  body("comments").optional().isArray(),
  body("comments.*").optional().isString(),
];
export async function createDuty(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { targetThresholdHours, interval, reactions, comments } = req.body;

    const id = new Types.ObjectId(req.params.id);
    const target = req.body.target as IBotTargetEnum;
    const type = req.body.type as IBotTypeEnum;

    const duty = await Bot.create({
      userId: id,
      target,
      type,
      targetThresholdHours,
      interval,
      reactions,
      comments,
    });

    const botUser = await User.findById(id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      )
    );

    createCron(duty._id.toString(), duty, botUser)?.start();

    return res.status(StatusCodes.CREATED).json({
      sucess: true,
      data: { duty },
    });
  } catch (err) {
    next(err);
  }
}
