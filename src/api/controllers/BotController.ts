import { NextFunction, Request, Response } from "express";
import { ValidationChain, body, param } from "express-validator";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";
import User, { SignupMethodEnum, UserRoleEnum } from "../../models/User";
import Bot, { IBotTarget, IBotType } from "../../models/Bot";
import { createCron } from "../../cronjobs/bots";

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
      throw createError("User already exists", 409);
    }

    if (username) {
      user = await User.findOne({
        username: username,
      });
      if (user) {
        throw createError("User already exists", 409);
      }
    }
    user = await User.create({
      name,
      username: username || Math.random().toString(36).substring(2, 15),
      email: {
        address: email,
        verified: false,
      },
      role: UserRoleEnum.user,
      signupMethod: SignupMethodEnum.bot,
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
    const { id } = req.params;
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
  body("target").isIn(Object.values(IBotTarget)),
  body("type").isIn(Object.values(IBotType)),
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
    const {
      target,
      type,
      targetThresholdHours,
      interval,
      reactions,
      comments,
    } = req.body;
    const { id } = req.params;
    const duty = await Bot.create({
      userId: id,
      target,
      type,
      targetThresholdHours,
      interval,
      reactions,
      comments,
    });
    const botUser = await User.findById(id);
    createCron(duty._id.toString(), duty, botUser)?.start();
    return res.json({
      sucess: true,
      data: { duty },
    });
  } catch (err) {
    next(err);
  }
}
