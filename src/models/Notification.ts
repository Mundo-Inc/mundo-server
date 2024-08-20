import mongoose, { Schema, type Model, type Types } from "mongoose";

import { ResourceTypeEnum } from "./_enum/ResourceTypeEnum.js";

export enum NotificationTypeEnum {
  Reaction = "REACTION",
  Comment = "COMMENT",
  Follow = "FOLLOW",
  CommentMention = "COMMENT_MENTION",
  FollowingCheckIn = "FOLLOWING_CHECKIN",
  FollowingReview = "FOLLOWING_REVIEW",
  FollowingHomemade = "FOLLOWING_HOMEMADE",
  ReferralReward = "REFERRAL_REWARD",
  FollowRequest = "FOLLOW_REQUEST",
  FollowRequestAccepted = "FOLLOW_REQUEST_ACCEPTED",
}

export type NotificationResourceType =
  | ResourceTypeEnum.Reaction
  | ResourceTypeEnum.Comment
  | ResourceTypeEnum.User
  | ResourceTypeEnum.Review
  | ResourceTypeEnum.Homemade
  | ResourceTypeEnum.CheckIn
  | ResourceTypeEnum.Follow
  | ResourceTypeEnum.FollowRequest;

const NotificationResourceTypes: NotificationResourceType[] = [
  ResourceTypeEnum.Reaction,
  ResourceTypeEnum.Comment,
  ResourceTypeEnum.User,
  ResourceTypeEnum.Review,
  ResourceTypeEnum.Homemade,
  ResourceTypeEnum.CheckIn,
  ResourceTypeEnum.Follow,
  ResourceTypeEnum.FollowRequest,
];

interface Resources {
  _id: Types.ObjectId;
  type: NotificationResourceType;
  amount: number;
  date: Date;
}

interface Metadata {
  image?: string;
  link?: string;
}

export interface INotification {
  _id: Types.ObjectId;
  user: Types.ObjectId;
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
            enum: NotificationResourceTypes,
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
  },
);

NotificationSchema.index({ updatedAt: 1 });

const Notification =
  (mongoose.models.Notification as Model<INotification>) ||
  mongoose.model<INotification>("Notification", NotificationSchema);

export default Notification;
