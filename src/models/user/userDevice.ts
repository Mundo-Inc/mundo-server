import { Schema } from "mongoose";
import { z } from "zod";

export const zUserDeviceSchema = z.object({
  apnToken: z.string().optional(),
  fcmToken: z.string().optional(),
  platform: z.string(),
});

export type IUserDevice = z.infer<typeof zUserDeviceSchema>;

export const userDeviceSchema = new Schema<IUserDevice>(
  {
    apnToken: {
      type: String,
    },
    fcmToken: {
      type: String,
    },
    platform: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);
