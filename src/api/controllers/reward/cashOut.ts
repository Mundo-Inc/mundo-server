import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import type { IUser } from "../../../models/user/user.js";
import User from "../../../models/user/user.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { sendSlackMessage } from "../SlackController.js";

export async function cashOut(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = req.user!;

    const user = await User.findById(authUser._id)
      .orFail(
        createError(dynamicMessage(ds.notFound, "User"), StatusCodes.NOT_FOUND),
      )
      .select<Pick<IUser, "earnings">>("earnings")
      .lean();

    if (user.earnings.balance < 2500) {
      throw createError(
        "You do not have enough balance to cash out, try again later.",
        StatusCodes.BAD_REQUEST,
      );
    }

    sendSlackMessage(
      "phantomAssistant",
      `Cashout request from ${authUser.name}\nEmail: ${authUser.email.address}, Balance: $${user.earnings.balance / 100}`,
      undefined,
      true,
    );

    res.status(StatusCodes.OK).json(
      createResponse({
        message: "We got your cashout request, We'll email the details soon.",
      }),
    );
  } catch (error) {
    next(error);
  }
}
