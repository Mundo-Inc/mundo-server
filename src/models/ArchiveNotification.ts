import mongoose, { Schema } from "mongoose";
import {
  NotificationType,
  ResourceTypes,
  type INotification,
} from "./Notification";

export interface IArchiveNotification extends INotification {
  archivedAt: Date;
}

const ArchiveNotificationSchema: Schema = new Schema<IArchiveNotification>({
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
    index: true,
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
  createdAt: {
    type: Date,
  },
  updatedAt: {
    type: Date,
  },
  archivedAt: {
    type: Date,
    default: Date.now,
  },
});

ArchiveNotificationSchema.index({ updatedAt: 1 });

export default mongoose.models.ArchiveNotification ||
  mongoose.model<INotification>(
    "ArchiveNotification",
    ArchiveNotificationSchema
  );
