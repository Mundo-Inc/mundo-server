import { Schema } from "mongoose";
import { z } from "zod";

export const zUserAppUsageSchema = z.object({
  version: z.string().optional(),
  lastOpenedAt: z.date(),
  streakStartDate: z.date(),
});

export type IUserAppUsage = z.infer<typeof zUserAppUsageSchema>;

export const userAppUsageSchema = new Schema<IUserAppUsage>(
  {
    version: {
      type: String,
    },
    lastOpenedAt: {
      type: Date,
      default: Date.now,
    },
    streakStartDate: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);
