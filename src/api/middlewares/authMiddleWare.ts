import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";

import User from "../../models/User.js";
import { createError } from "../../utilities/errorHandlers.js";
import UserProjection, { type UserProjectionPrivate } from "../dto/user.js";

async function verifyAndFetchUser(req: Request) {
  const token = req.headers.authorization || req.cookies.token;

  if (!token) {
    throw createError("Token is required", StatusCodes.BAD_REQUEST);
  }

  let user: UserProjectionPrivate | null = null;

  try {
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded || typeof decoded.payload != "object") {
      throw createError("Invalid token", StatusCodes.UNAUTHORIZED);
    }

    let uid: string;
    if (decoded.payload.aud === "the-mundo") {
      const firebaseUser = await getAuth()
        .verifyIdToken(token)
        .catch((err) => {
          if (err.code !== "auth/argument-error") {
            throw err;
          }

          const uid = decoded.payload.sub as string | undefined;

          if (!uid) {
            throw createError("Invalid token", StatusCodes.UNAUTHORIZED);
          }

          return {
            uid: uid,
          };
        });
      uid = firebaseUser.uid;
    } else {
      const firebaseUser = await getAuth().verifyIdToken(token);
      uid = firebaseUser.uid;
    }

    user = await User.findOne({
      uid: uid,
    })
      .select<UserProjectionPrivate>(UserProjection.private)
      .lean();
    // }
  } catch (err) {
    console.log(err);
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
