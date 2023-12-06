import mongoose, { Schema, type Document, CallbackError } from "mongoose";
import Notification, { NotificationType, ResourceTypes } from "./Notification";
import UserActivity from "./UserActivity";
import logger from "../api/services/logger";

export interface IReaction extends Document {
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
        type: ResourceTypes.REACTION,
      },
    },
  });
  // Delete each notification one by one to trigger any associated middleware
  await Promise.all(
    notifications.map((notification) => notification.deleteOne())
  );
}

ReactionSchema.pre<IReaction>(
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
      type: NotificationType.REACTION,
      resources: [
        { _id: doc._id, type: ResourceTypes.REACTION, date: doc.createdAt },
      ],
      importance: 1,
    });
  }

  next();
});

export default mongoose.models.Reaction ||
  mongoose.model<IReaction>("Reaction", ReactionSchema);
