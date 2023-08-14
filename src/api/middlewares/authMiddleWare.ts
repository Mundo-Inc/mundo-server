import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { StatusCodes } from "http-status-codes";

interface DecodedUser {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

export function authMiddleware(
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

    req.user = {
      id: decodedUser.userId,
      role: decodedUser.role as "user" | "admin",
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

declare global {
  namespace Express {
    interface User {
      id: string;
      role: "user" | "admin";
    }
  }
}
