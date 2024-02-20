import mongoose, { Schema, type Document } from "mongoose";

export enum NotificationType {
  REACTION = "REACTION",
  COMMENT = "COMMENT",
  FOLLOW = "FOLLOW",
  COMMENT_MENTION = "COMMENT_MENTION",
  REVIEW_MENTION = "REVIEW_MENTION",
  XP = "XP",
  LEVEL_UP = "LEVEL_UP",
  NEW_REVIEW = "NEW_REVIEW",
  FOLLOWING_CHECKIN = "FOLLOWING_CHECKIN",
  FOLLOWING_REVIEW = "FOLLOWING_REVIEW",
  REFERRAL_REWARD = "REFERRAL_REWARD",
}

export enum ResourceTypes {
  REACTION = "Reaction",
  COMMENT = "Comment",
  USER = "User",
  REVIEW = "Review",
  CHECKIN = "CheckIn",
  FOLLOW = "Follow",
}

interface Resources {
  _id: mongoose.Types.ObjectId;
  type: ResourceTypes;
  amount: number;
  date: Date;
}

interface Metadata {
  image?: string;
  link?: string;
}

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  type: NotificationType;
  readAt: Date | null;
  sent: boolean;
  failReason?: string;
  importance: 0 | 1 | 2 | 3;
  resources?: Resources[];
  batchCount: number;
  content?: string | null;
  metadata?: Metadata;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema<INotification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(NotificationType),
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    sent: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    failReason: {
      type: String,
      default: null,
    },
    importance: {
      type: Number,
      required: true,
      enum: [0, 1, 2, 3],
      default: 0,
    },
    resources: {
      type: [
        {
          _id: {
            type: Schema.Types.ObjectId,
            required: true,
          },
          type: {
            type: String,
            enum: Object.values(ResourceTypes),
            required: true,
          },
          date: {
            type: Date,
            required: true,
          },
        },
      ],
      default: [],
    },
    batchCount: {
      type: Number,
      required: true,
      default: 1,
    },
    content: {
      type: String,
      default: null,
    },
    metadata: {
      type: {
        image: {
          type: String,
          default: null,
        },
        link: {
          type: String,
          default: null,
        },
      },
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ updatedAt: 1 });

export default mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);
