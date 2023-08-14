import type { NextFunction, Request, Response } from "express";
import { body, query, type ValidationChain } from "express-validator";

import bcrypt from "bcryptjs";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import User from "../../models/User";
import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";
import passport from "../lib/passport-setup";

export const signinValidation: ValidationChain[] = [
  body("action").isIn(["signin", "signout"]),
  validate.email(body("email")),
  validate.password(body("password")),
];

export const authGetValidation: ValidationChain[] = [
  query("provider").isString().isIn(["google", "facebook", "apple"]),
];

function generateJwtToken(user: { _id: string; role: string }) {
  return jwt.sign({ userId: user._id, role: user.role }, config.JWT_SECRET, {
    expiresIn: "30d",
  });
}

/**
 * Sign-in | Sign-out
 */
export async function authPost(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { email, password, action } = req.body;

    if (action === "signin") {
      const user = await User.findOne({
        "email.address": { $regex: new RegExp(email, "i") },
      });
      if (!user) {
        throw createError(strings.authorization.invalidCredentials, 401);
      }
      const isPasswordCorrect = await bcrypt.compare(password, user.password);
      if (!isPasswordCorrect) {
        throw createError(strings.authorization.invalidCredentials, 401);
      }
      const token = generateJwtToken(user);
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        maxAge: +process.env.JWT_MAX_AGE!,
        sameSite: "strict",
        path: "/",
      });

      res.status(200).json({ userId: user._id, token });
    } else if (action === "signout") {
      res.clearCookie("token");

      res.sendStatus(StatusCodes.NO_CONTENT);
    } else {
      throw createError(strings.server.invalidAction, 400);
    }
  } catch (err) {
    next(err);
  }
}

export async function authGet(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.query.provider === "google") {
      try {
        passport.authenticate("google", { scope: ["profile", "email"] })(
          req,
          res
        );
      } catch (err) {
        next(err);
      }
    } else if (req.query.provider === "apple") {
      passport.authenticate("apple", { scope: ["profile", "email"] })(req, res);
    } else if (req.query.provider === "facebook") {
      passport.authenticate("facebook", { scope: ["profile", "email"] })(
        req,
        res
      );
    } else {
      throw createError(strings.server.invalidAction, 400);
    }
  } catch (err) {
    next(err);
  }
}

export async function authCallback(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    passport.authenticate("google", async (err: any, user: any) => {
      if (err) {
        throw err;
      } else {
        const token = generateJwtToken(user);
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV !== "development",
          maxAge: +process.env.JWT_MAX_AGE!,
          sameSite: "lax",
          path: "/",
        });
        res.status(200).json({ userId: user._id, token });
      }
    })(req, res);

    passport.authenticate("facebook", async (err: any, user: any) => {
      if (err) {
        throw err;
      } else {
        const token = generateJwtToken(user);
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV !== "development",
          maxAge: +process.env.JWT_MAX_AGE!,
          sameSite: "lax",
          path: "/",
        });
        res.status(200).json({ userId: user._id, token });
      }
    })(req, res);

    passport.authenticate("apple", async (err: any, user: any) => {
      if (err) {
        throw err;
      } else {
        const token = generateJwtToken(user);
        res.cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV !== "development",
          maxAge: +process.env.JWT_MAX_AGE!,
          sameSite: "lax",
          path: "/",
        });
        res.status(200).json({ userId: user._id, token });
      }
    })(req, res);
  } catch (err) {
    console.log(err);
    next(err);
  }
}
