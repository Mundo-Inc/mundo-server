import mongoose, { Schema, type Document } from "mongoose";

export interface IEvent extends Document {
  place: mongoose.Types.ObjectId;
  name: string;
  description: string;
  logo?: string;
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema: Schema = new Schema<IEvent>(
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
  }
);

export default mongoose.models.Event ||
  mongoose.model<IEvent>("Event", EventSchema);
