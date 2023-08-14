import type { Types } from "mongoose";

export type ReadReviewDto = {
  _id: Types.ObjectId;
  writer: Types.ObjectId;
  place: Types.ObjectId;
  scores: {
    overall: number;
    drinkQuality: number;
    foodQuality: number;
    atmosphere: number;
    service: number;
    value: number;
    phantom: number;
  };
  content: string;
  media?: string[];
};

export const readReviewProjection = {
  _id: 1,
  writer: 1,
  place: 1,
  scores: 1,
  content: 1,
  media: 1,
};
