import mongoose, { Schema, type Document } from "mongoose";
import Notification, { NotificationType, ResourceTypes } from "./Notification";
import UserActivity from "./UserActivity";

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
