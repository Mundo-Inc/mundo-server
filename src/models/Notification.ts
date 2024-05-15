import mongoose, { Schema, type Model } from "mongoose";

export enum NotificationTypeEnum {
  REACTION = "REACTION",
  COMMENT = "COMMENT",
  FOLLOW = "FOLLOW",
  FOLLOW_REQUEST = "FOLLOW_REQUEST",
  FOLLOW_REQUEST_ACCEPTED = "FOLLOW_REQUEST_ACCEPTED",
  COMMENT_MENTION = "COMMENT_MENTION",
  REVIEW_MENTION = "REVIEW_MENTION",
  XP = "XP",
  LEVEL_UP = "LEVEL_UP",
  NEW_REVIEW = "NEW_REVIEW",
  FOLLOWING_CHECKIN = "FOLLOWING_CHECKIN",
  FOLLOWING_REVIEW = "FOLLOWING_REVIEW",
  FOLLOWING_HOMEMADE = "FOLLOWING_HOMEMADE",
  REFERRAL_REWARD = "REFERRAL_REWARD",
}

export enum ResourceTypeEnum {
  REACTION = "Reaction",
  COMMENT = "Comment",
  USER = "User",
  REVIEW = "Review",
  Homemade = "Homemade",
  CHECKIN = "CheckIn",
  FOLLOW = "Follow",
  FOLLOW_REQUEST = "FollowRequest",
}

interface Resources {
  _id: mongoose.Types.ObjectId;
  type: ResourceTypeEnum;
  amount: number;
  date: Date;
}

interface Metadata {
  image?: string;
  link?: string;
}

export interface INotification {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  type: NotificationTypeEnum;
  readAt: Date | null;
  sent: boolean;
  failReason?: string;
  importance: 0 | 1 | 2 | 3;
  resources?: Resources[];
  additionalData?: {
    amount?: number;
    newUserName?: string;
  };
  batchCount: number;
  content?: string | null;
  metadata?: Metadata;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
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
      enum: Object.values(NotificationTypeEnum),
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
            enum: Object.values(ResourceTypeEnum),
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
    additionalData: {
      amount: {
        type: Number,
        required: false,
      },
      newUserName: {
        type: String,
        required: false,
      },
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

const model =
  (mongoose.models.Notification as Model<INotification>) ||
  mongoose.model<INotification>("Notification", NotificationSchema);

export default model;
