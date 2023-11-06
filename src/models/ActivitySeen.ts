import mongoose, { Schema, type Document } from "mongoose";

export interface IActivitySeen extends Document {
  observerId: mongoose.Types.ObjectId; // user who seen the activity
  activityId: mongoose.Types.ObjectId; // id of activity
  seenAt: Date;
  count: Number; // occurrence of an seen by a user
}

const ActivitySeenSchema: Schema = new Schema<IActivitySeen>({
  observerId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  activityId: {
    type: Schema.Types.ObjectId,
    ref: "UserActivity",
    required: true,
    index: true,
  },
  seenAt: { type: Date, default: Date.now, index: true },
  count: { type: Number, default: 1, index: true },
});

ActivitySeenSchema.index({
  observerId: 1,
  activityId: 1,
  seenAt: -1,
  count: 1,
});

export default mongoose.models.ActivitySeen ||
  mongoose.model<IActivitySeen>("ActivitySeen", ActivitySeenSchema);
