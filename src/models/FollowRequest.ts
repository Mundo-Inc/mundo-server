import mongoose, { Schema, type Model, type Types } from "mongoose";

import { ResourceTypeEnum } from "./Enum/ResourceTypeEnum.js";
import Notification, { NotificationTypeEnum } from "./Notification.js";

export interface IFollowRequest {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  target: Types.ObjectId;
  createdAt: Date;
}

const FollowRequestSchema = new Schema<IFollowRequest>({
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
});

FollowRequestSchema.index({ user: 1, target: 1 });

FollowRequestSchema.post("save", async function (doc, next) {
  // create notification
  await Notification.create({
    user: doc.target,
    type: NotificationTypeEnum.FollowRequest,
    resources: [
      {
        _id: doc._id,
        type: ResourceTypeEnum.FollowRequest,
        date: doc.createdAt,
      },
    ],
    importance: 2,
  });

  next();
});

const FollowRequest =
  (mongoose.models.FollowRequest as Model<IFollowRequest>) ||
  mongoose.model<IFollowRequest>("FollowRequest", FollowRequestSchema);

export default FollowRequest;
