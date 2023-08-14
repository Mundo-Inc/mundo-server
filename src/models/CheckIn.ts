import mongoose, { Schema, type Document } from "mongoose";

export interface ICheckIn extends Document {
  user: mongoose.Types.ObjectId;
  place: mongoose.Types.ObjectId;
  createdAt: Date;
  userActivityId?: mongoose.Types.ObjectId;
}

const CheckInSchema: Schema = new Schema<ICheckIn>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  place: { type: Schema.Types.ObjectId, ref: "Place", required: true },
  createdAt: { type: Date, default: Date.now },
  userActivityId: { type: Schema.Types.ObjectId, ref: "UserActivity" },
});

export default mongoose.models.CheckIn ||
  mongoose.model<ICheckIn>("CheckIn", CheckInSchema);
