import mongoose, { Schema, type Document } from "mongoose";
import Notification, { NotificationType, ResourceTypes } from "./Notification";

export interface IFollowRequest extends Document {
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  createdAt: Date;
}

const FollowRequestSchema = new Schema<IFollowRequest>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    target: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

FollowRequestSchema.index({ user: 1, target: 1 });

FollowRequestSchema.post("save", async function (doc, next) {
  // create notification
  await Notification.create({
    user: doc.target,
    type: NotificationType.FOLLOW,
    resources: [
      { _id: doc._id, type: ResourceTypes.FOLLOW, date: doc.createdAt },
    ],
    importance: 2,
  });

  next();
});

export default mongoose.models.FollowRequest ||
  mongoose.model<IFollowRequest>("FollowRequest", FollowRequestSchema);
