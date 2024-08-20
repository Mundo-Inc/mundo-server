import { Schema } from "mongoose";
import { z } from "zod";

export const zDailyRewardSchema = z.object({
  streak: z.number(),
  lastClaim: z.date().optional(),
});

export type IDailyReward = z.infer<typeof zDailyRewardSchema>;

export const dailyRewardSchema = new Schema<IDailyReward>(
  {
    streak: {
      type: Number,
      required: true,
    },
    lastClaim: {
      type: Date,
    },
  },
  { _id: false },
);
