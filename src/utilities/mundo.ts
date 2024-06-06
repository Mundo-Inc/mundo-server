import { StatusCodes } from "http-status-codes";
import { type Types } from "mongoose";

import User from "../models/User.js";
import { dStrings, dynamicMessage } from "../strings.js";
import { createError } from "./errorHandlers.js";

export async function shouldBotInteract(userId: Types.ObjectId) {
  const user = await User.findById(userId).orFail(
    createError(
      dynamicMessage(dStrings.notFound, "User"),
      StatusCodes.NOT_FOUND
    )
  );

  if (!user.mundoInteractionFrequency) {
    user.mundoInteractionFrequency = 30;
    await user.save();
    return true;
  }

  return Math.random() * 100 < user.mundoInteractionFrequency;
}
