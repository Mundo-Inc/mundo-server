import { NextFunction, Request, Response } from "express";
import User from "../../models/User.js";

async function updateUsers() {
  const defaultAppUsage = {
    lastLogin: new Date(),
    streak: {
      currentStreak: 0,
      lastLoginDate: new Date(),
    },
  };

  const result = await User.updateMany(
    { appUsage: { $exists: false } }, // Find users without the appUsage field
    { $set: { appUsage: defaultAppUsage } }, // Set the appUsage field with default values
  );
}

export async function trackAppUsage(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    //TODO: EXEC & REMOVE AFTER LAUNCH
    await updateUsers();

    const user = await User.findById(authUser._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to midnight to only compare dates

    const lastLoginDate = user.appUsage.streak.lastLoginDate;
    const currentStreak = user.appUsage.streak.currentStreak || 0;

    if (lastLoginDate) {
      const lastLogin = new Date(lastLoginDate);
      lastLogin.setHours(0, 0, 0, 0);

      const differenceInDays =
        (today.getTime() - lastLogin.getTime()) / (1000 * 3600 * 24);

      if (differenceInDays === 1) {
        // Consecutive day
        user.appUsage.streak.currentStreak = currentStreak + 1;
      } else if (differenceInDays > 1) {
        // Missed days
        user.appUsage.streak.currentStreak = 1;
      }
    } else {
      // First login
      user.appUsage.streak.currentStreak = 1;
    }

    user.appUsage.streak.lastLoginDate = today;
    user.appUsage.lastLogin = new Date();

    await user.save();

    next();
  } catch (err) {
    next(err);
  }
}
