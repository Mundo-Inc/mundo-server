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
    const decoded = jwt.decode(token, { complete: true });
    const payload = decoded?.payload;
    if (payload && typeof payload == "object") {
      if (payload.iss && payload.iss.includes("securetoken.google.com")) {
        const firebaseUser = await getAuth().verifyIdToken(token);
        const uid = firebaseUser.uid;
        const user: IUser | null = await User.findById(uid).lean();
        if (!user) {
          return res
            .status(StatusCodes.UNAUTHORIZED)
            .json({ error: "User not found" });
        }
        req.user = {
          id: user._id,
          role: user.role as "user" | "admin",
        };
      } else if (payload.userId) {
        const oldTokenPayload = jwt.verify(
          token,
          config.JWT_SECRET
        ) as DecodedUser;
        req.user = {
          id: oldTokenPayload.userId,
          role: oldTokenPayload.role as "user" | "admin",
        };
      }
    }
    next();
  } catch (err) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ error: "Invalid or expired authentication token." });
  }
}

export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.header("Authorization") || req.cookies?.token;

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.decode(token, { complete: true });
    const payload = decoded?.payload;
    if (payload && typeof payload == "object") {
      if (payload.iss && payload.iss.includes("securetoken.google.com")) {
        const firebaseUser = await getAuth().verifyIdToken(token);
        const uid = firebaseUser.uid;
        const user: IUser | null = await User.findById(uid).lean();
        if (user) {
          req.user = {
            id: user._id,
            role: user.role as "user" | "admin",
          };
        }
      } else if (payload.userId) {
        const oldTokenPayload = jwt.verify(
          token,
          config.JWT_SECRET
        ) as DecodedUser;
        req.user = {
          id: oldTokenPayload.userId,
          role: oldTokenPayload.role as "user" | "admin",
        };
      }
    }
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
    const decoded = jwt.decode(token, { complete: true });
    const payload = decoded?.payload;
    if (payload && typeof payload == "object") {
      if (payload.iss && payload.iss.includes("securetoken.google.com")) {
        const firebaseUser = await getAuth().verifyIdToken(token);
        const uid = firebaseUser.uid;
        const user: IUser | null = await User.findById(uid).lean();
        if (!user || user.role !== "admin") {
          return res
            .status(StatusCodes.UNAUTHORIZED)
            .json({ error: "Admins only." });
        }
        req.user = {
          id: user._id,
          role: user.role as "user" | "admin",
        };
      } else if (payload.userId) {
        const oldTokenPayload = jwt.verify(
          token,
          config.JWT_SECRET
        ) as DecodedUser;
        const user: IUser | null = await User.findById(
          oldTokenPayload.userId
        ).lean();
        if (!user || user.role !== "admin") {
          return res
            .status(StatusCodes.UNAUTHORIZED)
            .json({ error: "Admins only." });
        }
        req.user = {
          id: oldTokenPayload.userId,
          role: oldTokenPayload.role as "user" | "admin",
        };
      }
    }
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
