import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";

import { config } from "../../config";
import User, { type IUser } from "../../models/User";
import UserProjection, { type UserPrivateKeys } from "../dto/user/user";
import { createError } from "../../utilities/errorHandlers";

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

  let user: Pick<IUser, UserPrivateKeys> | null = null;

  try {
    const decoded = jwt.decode(token, { complete: true });

    if (
      decoded?.payload &&
      typeof decoded?.payload == "object" &&
      decoded?.payload.iss &&
      decoded?.payload.iss.includes("securetoken.google.com")
    ) {
      const firebaseUser = await getAuth().verifyIdToken(token);

      user = await User.findOne(
        {
          uid: firebaseUser.uid,
        },
        UserProjection.private
      ).lean();
    } else {
      const oldTokenPayload = jwt.verify(
        token,
        config.JWT_SECRET
      ) as DecodedUser;

      user = await User.findOne(
        {
          uid: oldTokenPayload.userId,
        },
        UserProjection.private
      ).lean();
    }
  } catch (err) {
    throw createError("Invalid or expired token", StatusCodes.UNAUTHORIZED);
  }

  if (!user) {
    throw createError("User not found", StatusCodes.NOT_FOUND);
  }

  return user;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    req.user = await verifyAndFetchUser(req);

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
      user?: Pick<IUser, UserPrivateKeys>;
    }
  }
}
