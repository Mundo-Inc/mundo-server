import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { handleSignUp } from "@/api/lib/profile-handlers.js";
import logger from "@/api/services/logger/index.js";
import { env } from "@/env.js";
import User, { SignupMethodEnum } from "@/models/User.js";
import { sendSlackMessage } from "../SlackController.js";

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
    if (authHeader === env.FIREBASE_SYNC_SECRET) {
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
          SignupMethodEnum.Cloud,
          null,
          userData.uid,
          userData.photoURL
        );

        try {
          sendSlackMessage(
            "phantomAssistant",
            `New user: ${userData.displayName || "- - -"}\n${username} (${
              userData.email
            })`,
            userData.photoURL || undefined
          );
        } catch (error) {
          logger.error("Error sending slack message", error);
        }
      }

      res.status(StatusCodes.OK).send("User data received");
    } else {
      // Respond with an error or ignore the request
      res.status(StatusCodes.FORBIDDEN).send("Unauthorized");
    }
  } catch (error) {
    next(error);
  }
}
