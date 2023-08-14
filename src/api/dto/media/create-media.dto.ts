import type { Types } from "mongoose";

export type CreateMediaDto = {
  src: string;
  caption: string;
  place: Types.ObjectId;
  user: Types.ObjectId;
  type: string;
};
