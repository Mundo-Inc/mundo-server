import mongoose, { Schema, type Document } from "mongoose";

export interface IActivitySeen extends Document {
  observerId: mongoose.Types.ObjectId; // user who seen the activity
  subjectId: mongoose.Types.ObjectId; // activity owner
  activityId: mongoose.Types.ObjectId; // id of activity
  seenAt: Date;
  weight: Number; // occurrence of an activity by a user
}

const ActivitySeenSchema: Schema = new Schema<IActivitySeen>({
  observerId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  subjectId: {
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
  weight: { type: Number, default: 0, index: true },
});

ActivitySeenSchema.index({
  observerId: 1,
  subjectId: 1,
  activityId: 1,
  seenAt: -1,
  weight: 1,
});

export default mongoose.models.ActivitySeen ||
  mongoose.model<IActivitySeen>("ActivitySeen", ActivitySeenSchema);
