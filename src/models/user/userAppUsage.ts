import { Schema } from "mongoose";
import { z } from "zod";

export const zUserAppUsageSchema = z.object({
  lastLogin: z.date(),
  streak: z.object({
    currentStreak: z.number(),
    lastLoginDate: z.date(),
  }),
});

export type IUserAppUsage = z.infer<typeof zUserAppUsageSchema>;

export const userAppUsageSchema = new Schema<IUserAppUsage>(
  {
    lastLogin: {
      type: Date,
    },
    streak: {
      currentStreak: {
        type: Number,
        default: 0,
      },
      lastLoginDate: {
        type: Date,
      },
    },
  },
  { _id: false },
);
