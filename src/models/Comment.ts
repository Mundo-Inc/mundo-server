import mongoose, { Schema, type Model, type Types } from "mongoose";

import { ResourceTypeEnum } from "./Enum/ResourceTypeEnum.js";
import Notification, { NotificationTypeEnum } from "./Notification.js";
import UserActivity from "./UserActivity.js";

export interface IMention {
  user: Types.ObjectId;
  username: string;
}

export interface IComment {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  userActivity: Types.ObjectId;
  content: string;
  likes: Types.ObjectId[];
  mentions?: IMention[];
  rootComment?: Types.ObjectId;
  parent?: Types.ObjectId;
  children: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const MentionSchema = new Schema<IMention>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    username: {
      type: String,
    },
  },
  {
    _id: false,
  }
);

const CommentSchema = new Schema<IComment>(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Author is required"],
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
      maxlength: [500, "Content must be at most 500 characters"],
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
    mentions: {
      type: [MentionSchema],
      validate: [arrayLimit, "{PATH} exceeds the limit of 10"],
    },
    rootComment: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    children: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Comment",
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

CommentSchema.index({ author: 1 });
CommentSchema.index({ userActivity: 1 });
CommentSchema.index({ rootComment: 1 });
CommentSchema.index({ parent: 1 });
CommentSchema.index({ createdAt: 1 });
CommentSchema.index({ "mentions.user": 1 });

function arrayLimit(val: any) {
  return val.length <= 10;
}

CommentSchema.post("save", async function (doc, next) {
  // create notification
  if (doc.createdAt.getTime() === doc.updatedAt.getTime()) {
    const activity = await UserActivity.findById(doc.userActivity).lean();

    if (activity) {
      await Notification.create({
        user: activity.userId,
        type: NotificationTypeEnum.Comment,
        resources: [
          { _id: doc._id, type: ResourceTypeEnum.Comment, date: doc.createdAt },
        ],
        importance: 2,
      });
    }
    if (doc.mentions && doc.mentions.length > 0) {
      for (const mention of doc.mentions) {
        await Notification.create({
          user: mention.user,
          type: NotificationTypeEnum.CommentMention,
          resources: [
            {
              _id: doc._id,
              type: ResourceTypeEnum.Comment,
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

const Comment =
  (mongoose.models.Comment as Model<IComment>) ||
  mongoose.model<IComment>("Comment", CommentSchema);

export default Comment;
