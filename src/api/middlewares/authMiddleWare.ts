import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { StatusCodes } from "http-status-codes";
import User, { type IUser } from "../../models/User";
import { getAuth } from "firebase-admin/auth";

interface DecodedUser {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.header("Authorization") || req.cookies?.token;

  if (!token) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: "No authentication token provided." });
  }

  try {
    // const decodedUser = jwt.verify(token, config.JWT_SECRET) as DecodedUser;
    const decodedToken = await getAuth().verifyIdToken(token)
    const uid = decodedToken.uid

    const user = await User.findById(uid)

    req.user = {
      id: user._id,
      role: user.role as "user" | "admin",
    };

    next();
  } catch (err) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: "Invalid or expired authentication token." });
  }
}

export function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.header("Authorization") || req.cookies?.token;

  if (!token) {
    return next();
  }

  try {
    const decodedUser = jwt.verify(token, config.JWT_SECRET) as DecodedUser;

    req.user = {
      id: decodedUser.userId,
      role: decodedUser.role as "user" | "admin",
    };

    next();
  } catch (err) {
    next();
  }
}

export async function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.header("Authorization") || req.cookies?.token;

  if (!token) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: "No authentication token provided." });
  }

  try {
    const decodedUser = jwt.verify(token, config.JWT_SECRET) as DecodedUser;

    if (decodedUser.role !== "admin") {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ error: "Admins only." });
    }

    const user: IUser | null = await User.findById(decodedUser.userId).lean();
    if (!user || user.role !== "admin") {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ error: "Nice try :)" });
    }

    req.user = {
      id: decodedUser.userId,
      role: decodedUser.role,
    };

    next();
  } catch (err) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: "Invalid or expired authentication token." });
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      role: "user" | "admin";
    }
  }
}
