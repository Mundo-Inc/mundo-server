import { type Types } from "mongoose";

export type ReactionProjection = {
  total: Array<{
    reaction: string;
    count: number;
    type: string;
  }>;
  user: Array<{
    _id: Types.ObjectId;
    reaction: string;
    type: string;
    createdAt: Date;
  }>;
};
