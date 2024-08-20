import { Schema, Types } from "mongoose";
import { z } from "zod";

export const zUserProgressSchema = z.object({
  level: z.number(),
  xp: z.number(),
  achievements: z.array(z.instanceof(Types.ObjectId)),
});

export type IUserProgress = z.infer<typeof zUserProgressSchema>;

export const userProgressSchema = new Schema<IUserProgress>(
  {
    xp: {
      type: Number,
      default: 0,
    },
    level: {
      type: Number,
      default: 1,
    },
    achievements: {
      type: [{ type: Types.ObjectId, ref: "Achievement" }],
      default: [],
    },
  },
  { _id: false },
);
