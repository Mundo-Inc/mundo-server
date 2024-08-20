import mongoose, { Schema, type Model } from "mongoose";

export interface IEvent {
  _id: mongoose.Types.ObjectId;
  place: mongoose.Types.ObjectId;
  name: string;
  description: string;
  logo?: string;
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    place: {
      type: Schema.Types.ObjectId,
      ref: "Place",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    logo: {
      type: String,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

const Event =
  (mongoose.models.Event as Model<IEvent>) ||
  mongoose.model<IEvent>("Event", EventSchema);

export default Event;
