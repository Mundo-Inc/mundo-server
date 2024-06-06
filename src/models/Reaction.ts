import mongoose, { Schema, type CallbackError, type Model } from "mongoose";

import logger from "../api/services/logger/index.js";
import { ResourceTypeEnum } from "./Enum/ResourceTypeEnum.js";
import Notification, { NotificationTypeEnum } from "./Notification.js";
import UserActivity from "./UserActivity.js";

export interface IReaction {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  target: mongoose.Types.ObjectId;
  type: "emoji" | "special";
  reaction: string;
  createdAt: Date;
  source?: "yelp" | "google";
}

const ReactionSchema = new Schema<IReaction>({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  target: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
    refPath: "UserActivity",
  },
  type: {
    type: String,
    required: true,
    enum: ["emoji", "special"],
  },
  reaction: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  source: {
    type: String,
    enum: ["yelp", "google"],
  },
});

// dependency removal function
async function removeDependencies(reaction: IReaction) {
  // Find all notifications related to the comment
  const notifications = await Notification.find({
    resources: {
      $elemMatch: {
        _id: reaction._id,
        type: ResourceTypeEnum.Reaction,
      },
    },
  });
  // Delete each notification one by one to trigger any associated middleware
  await Promise.all(
    notifications.map((notification) => notification.deleteOne())
  );
}

ReactionSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      const reaction = this;
      removeDependencies(reaction);
      next();
    } catch (error) {
      next(error as CallbackError);
    }
  }
);

ReactionSchema.pre("deleteOne", async function (next) {
  try {
    logger.debug("deleteOne reaction");
    const reaction = await this.model.findOne(this.getQuery());
    await removeDependencies(reaction);
    next();
  } catch (error) {
    next(error as CallbackError);
  }
});

ReactionSchema.post("save", async function (doc, next) {
  // create notification
  const activity = await UserActivity.findById(doc.target);
  if (activity) {
    await Notification.create({
      user: activity.userId,
      type: NotificationTypeEnum.Reaction,
      resources: [
        { _id: doc._id, type: ResourceTypeEnum.Reaction, date: doc.createdAt },
      ],
      importance: 1,
    });
  }

  next();
});

const Reaction =
  (mongoose.models.Reaction as Model<IReaction>) ||
  mongoose.model<IReaction>("Reaction", ReactionSchema);

export default Reaction;
