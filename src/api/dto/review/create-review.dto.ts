import type { Types } from "mongoose";

export type CreateReviewDto = {
  writer: Types.ObjectId;
  place: Types.ObjectId;
  scores: {
    overall: number;
    drinkQuality?: number;
    foodQuality?: number;
    atmosphere?: number;
    service?: number;
    value?: number;
  };
  content: string;
  images?: string[];
  videos?: string[];
  // reactions: {
  //   like: Types.ObjectId[];
  //   dislike: Types.ObjectId[];
  // };
  // tags?: string[];
  language: string;
};
