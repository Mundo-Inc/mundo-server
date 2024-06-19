import mongoose, { Schema, type Model } from "mongoose";

export enum MediaTypeEnum {
  Image = "image",
  Video = "video",
}

export interface IMedia {
  _id: mongoose.Types.ObjectId;
  src: string;
  caption?: string;
  place?: mongoose.Types.ObjectId;
  event?: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  type: MediaTypeEnum;
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
    index: true,
  },
  event: {
    type: Schema.Types.ObjectId,
    ref: "Event",
    index: true,
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

MediaSchema.index({ place: 1 }, { sparse: true });

const Media =
  (mongoose.models.Media as Model<IMedia>) ||
  mongoose.model<IMedia>("Media", MediaSchema);

export default Media;
