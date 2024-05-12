import mongoose, { Schema, type Model } from "mongoose";

import Notification, {
  NotificationTypeEnum,
  ResourceTypeEnum,
} from "./Notification";

export enum FollowStatusEnum {
  FOLLOWING = "following",
  NOT_FOLLOWING = "notFollowing",
  REQUESTED = "requested",
}

export interface IFollow {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  createdAt: Date;
}

const FollowSchema = new Schema<IFollow>({
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

FollowSchema.index({ user: 1, target: 1 });

FollowSchema.post("save", async function (doc, next) {
  // create notification
  await Notification.create({
    user: doc.target,
    type: NotificationTypeEnum.FOLLOW,
    resources: [
      { _id: doc._id, type: ResourceTypeEnum.FOLLOW, date: doc.createdAt },
    ],
    importance: 2,
  });

  next();
});

const model =
  (mongoose.models.Follow as Model<IFollow>) ||
  mongoose.model<IFollow>("Follow", FollowSchema);

export default model;
