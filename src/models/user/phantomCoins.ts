import { Schema } from "mongoose";
import { z } from "zod";

import { dailyRewardSchema, zDailyRewardSchema } from "./dailyReward.js";

export const zPhantomCoinsSchema = z.object({
  balance: z.number(),
  daily: zDailyRewardSchema,
});

export type IPhantomCoins = z.infer<typeof zPhantomCoinsSchema>;

export const phantomCoinsSchema = new Schema<IPhantomCoins>(
  {
    balance: {
      type: Number,
      default: 0,
    },
    daily: {
      type: dailyRewardSchema,
      default: {
        streak: 0,
      },
    },
  },
  { _id: false },
);
