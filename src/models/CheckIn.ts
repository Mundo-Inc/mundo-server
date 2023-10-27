import mongoose, { Schema, type Document, CallbackError } from "mongoose";
import UserActivity from "./UserActivity";

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

async function removeDependencies(checkin: ICheckIn) {
  // remove the userActivity related to the review
  const userActivity = await UserActivity.findById(checkin.userActivityId);
  await userActivity.deleteOne();
}

CheckInSchema.pre<ICheckIn>(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      const checkin = this;
      // Find all notifications related to the comment
      await removeDependencies(checkin);
      next();
    } catch (error) {
      next(error as CallbackError);
    }
  }
);

CheckInSchema.pre("deleteOne", async function (next) {
  try {
    const checkin = await this.model.findOne(this.getQuery());
    await removeDependencies(checkin);
    next();
  } catch (error) {
    next(error as CallbackError);
  }
});

export default mongoose.models.CheckIn ||
  mongoose.model<ICheckIn>("CheckIn", CheckInSchema);
