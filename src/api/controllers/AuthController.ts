import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { body, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";

import { config } from "../../config";
import User, { SignupMethodEnum } from "../../models/User";
import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { handleSignUp } from "../lib/profile-handlers";
import validate from "./validators";
import { sendSlackMessage } from "./SlackController";

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;

export const signinValidation: ValidationChain[] = [
  body("action").isIn(["signin", "signout"]),
  validate.email(body("email")),
  validate.password(body("password")),
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

function createRandomUsername() {
  // Get the current timestamp
  const timestamp = Date.now();

  // Generate a random number, for example, between 0 to 999
  const randomNum = Math.floor(Math.random() * 1000);

  // Combine them to form a username
  const username = `ph${timestamp}${randomNum}`;
  return username;
}

export async function firebaseSync(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Add user data to your database
    const authHeader = req.headers.authorization;
    if (authHeader === process.env.FIREBASE_SYNC_SECRET) {
      // Proceed with handling the request
      const userData = req.body;

      const user = await User.findOne({
        uid: userData.uid,
        "email.address": userData.email,
      });

      if (!user) {
        const username = createRandomUsername();
        await handleSignUp(
          userData.email,
          userData.displayName || "",
          username,
          SignupMethodEnum.cloud,
          null,
          userData.uid,
          userData.photoURL
        );

        try {
          sendSlackMessage(
            "phantomAssistant",
            `New user:\nName: ${
              userData.displayName || "- - -"
            }\n${username} (${userData.email})`,
            userData.photoURL || undefined
          );
        } catch (error) {
          console.log(error);
        }
      }

      res.status(200).send("User data received");
    } else {
      // Respond with an error or ignore the request
      res.status(403).send("Unauthorized");
    }
  } catch (error) {
    next(error);
  }
}
