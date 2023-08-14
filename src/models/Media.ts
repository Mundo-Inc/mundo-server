import mongoose, { Schema, type Document } from "mongoose";

export enum MediaTypeEnum {
  image = "image",
  video = "video",
}

export interface IMedia extends Document {
  src: string;
  caption?: string;
  place: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  type: string;
}

const MediaSchema = new Schema<IMedia>({
  src: {
    type: String,
    required: true,
  },
  caption: {
    type: String,
    default: null,
  },
  place: {
    type: Schema.Types.ObjectId,
    ref: "Place",
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: Object.values(MediaTypeEnum),
  },
});

MediaSchema.index({ place: 1 });

export default mongoose.models.Media ||
  mongoose.model<IMedia>("Media", MediaSchema);
