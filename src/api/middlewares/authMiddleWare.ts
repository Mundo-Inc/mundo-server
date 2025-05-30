import type { NextFunction, Request, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";

import { MundoApp, PhPhApp } from "../../config/firebase-config.js";
import User, { type IUser } from "../../models/user/user.js";
import { createError } from "../../utilities/errorHandlers.js";

async function verifyAndFetchUser(req: Request) {
  const token = req.headers.authorization || req.cookies.token;

  if (!token) {
    throw createError("Authorization required", StatusCodes.UNAUTHORIZED);
  }

  const payload = jwt.decode(token);

  if (!payload || typeof payload !== "object") {
    throw createError("Invalid token", StatusCodes.UNAUTHORIZED);
  }

  try {
    const firebaseUser = await getAuth(
      payload.aud === "the-mundo" ? MundoApp : PhPhApp,
    ).verifyIdToken(token);

    const user = await User.findOne({
      uid: firebaseUser.uid,
    }).lean();

    return user;
  } catch (err) {
    throw createError("Invalid or expired token", StatusCodes.UNAUTHORIZED);
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
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
  next: NextFunction,
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
  next: NextFunction,
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

export async function authenticateSocket(socket: Socket) {
  try {
    const token =
      socket.handshake.auth.token ?? socket.handshake.headers.authorization;

    const firebaseUser = await getAuth(MundoApp).verifyIdToken(token);

    const user = await User.findOne({
      uid: firebaseUser.uid,
    })
      .orFail(createError("User not found", StatusCodes.NOT_FOUND))
      .lean();

    return user;
  } catch {
    return null;
  }
}

declare global {
  namespace Express {
    interface Request {
      user: IUser | null;
    }
  }
}
