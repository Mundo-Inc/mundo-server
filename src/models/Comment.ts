import mongoose, { Schema, type Document, CallbackError } from "mongoose";

import Notification, { NotificationType, ResourceTypes } from "./Notification";
import UserActivity, { type IUserActivity } from "./UserActivity";

export interface IComment extends Document {
  author: mongoose.Types.ObjectId;
  userActivity: mongoose.Types.ObjectId;
  content: string;
  likes: mongoose.Types.ObjectId[];
  mentions?: {
    user: mongoose.Types.ObjectId;
    username: string;
  }[];
  status?: "active" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Author is required"],
      index: true,
    },
    userActivity: {
      type: Schema.Types.ObjectId,
      ref: "UserActivity",
      required: [true, "UserActivity is required"],
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      minlength: [1, "Content must be at least 1 character"],
      maxlength: [250, "Content must be at most 250 characters"],
    },
    likes: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    mentions: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        username: {
          type: String,
        },
      },
    ],
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

CommentSchema.index({ "mentions.user": 1 });

CommentSchema.post("save", async function (doc, next) {
  // create notification
  if (doc.createdAt.getTime() === doc.updatedAt.getTime()) {
    const activity: IUserActivity | null = await UserActivity.findById(
      doc.userActivity
    ).lean();

    if (activity) {
      await Notification.create({
        user: activity.userId,
        type: NotificationType.COMMENT,
        resources: [
          { _id: doc._id, type: ResourceTypes.COMMENT, date: doc.createdAt },
        ],
        importance: 2,
      });
    }
    if (doc.mentions) {
      for (const mention of doc.mentions) {
        await Notification.create({
          user: mention.user,
          type: NotificationType.COMMENT_MENTION,
          resources: [
            {
              _id: doc._id,
              type: ResourceTypes.COMMENT,
              date: doc.createdAt,
            },
          ],
          importance: 2,
        });
      }
    }
  }

  next();
});

async function removeCommentDependencies(comment: IComment) {
  const notifications = await Notification.find({
    resources: {
      $elemMatch: {
        _id: comment._id,
        type: ResourceTypes.COMMENT,
      },
    },
  });
  // Delete each notification one by one to trigger any associated middleware
  await Promise.all(
    notifications.map((notification) => notification.deleteOne())
  );
}

CommentSchema.pre<IComment>(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    console.log("deleteOne comment");
    try {
      const comment = this;
      // Find all notifications related to the comment
      await removeCommentDependencies(comment);
      next();
    } catch (error) {
      next(error as CallbackError);
    }
  }
);

CommentSchema.pre("deleteOne", async function (next) {
  try {
    console.log("deleteOne comment");
    const comment = await this.model.findOne(this.getQuery());
    await removeCommentDependencies(comment);
    next();
  } catch (error) {
    next(error as CallbackError);
  }
});

export default mongoose.models.Comment ||
  mongoose.model<IComment>("Comment", CommentSchema);
