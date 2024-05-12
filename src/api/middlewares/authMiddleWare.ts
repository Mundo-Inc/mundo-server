import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";

import { config } from "../../config";
import User from "../../models/User";
import { createError } from "../../utilities/errorHandlers";
import UserProjection, { type UserProjectionPrivate } from "../dto/user";
import { dStrings, dynamicMessage } from "../../strings";

interface DecodedUser {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

async function verifyAndFetchUser(req: Request) {
  const token = req.headers.authorization || req.cookies.token;

  if (!token) {
    throw createError("Token is required", StatusCodes.BAD_REQUEST);
  }

  let user: UserProjectionPrivate | null = null;

  try {
    const decoded = jwt.decode(token, { complete: true });

    if (
      decoded?.payload &&
      typeof decoded?.payload == "object" &&
      decoded?.payload.iss &&
      decoded?.payload.iss.includes("securetoken.google.com")
    ) {
      const firebaseUser = await getAuth().verifyIdToken(token);

      user = await User.findOne({
        uid: firebaseUser.uid,
      })
        .select<UserProjectionPrivate>(UserProjection.private)
        .lean();
    } else {
      const oldTokenPayload = jwt.verify(
        token,
        config.JWT_SECRET
      ) as DecodedUser;

      user = await User.findById(oldTokenPayload.userId)
        .select<UserProjectionPrivate>(UserProjection.private)
        .lean();
    }
  } catch (err) {
    throw createError("Invalid or expired token", StatusCodes.UNAUTHORIZED);
  }

  return user;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await verifyAndFetchUser(req);

    if (!user) {
      throw createError("Unauthorized", StatusCodes.UNAUTHORIZED);
    }

    req.user = user;

    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    req.user = await verifyAndFetchUser(req);

    next();
  } catch {
    next();
  }
}

export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await verifyAndFetchUser(req);

    if (!user) {
      throw createError("Unauthorized", StatusCodes.UNAUTHORIZED);
    }

    if (user.role !== "admin") {
      throw createError("Insufficient Privileges", StatusCodes.UNAUTHORIZED);
    }

    req.user = user;

    next();
  } catch (err) {
    next(err);
  }
}

declare global {
  namespace Express {
    interface Request {
      user: UserProjectionPrivate | null;
    }
  }
}
