import mongoose, { Schema, type CallbackError, type Document } from "mongoose";

import logger from "../api/services/logger";
import Place from "./Place";
import UserActivity, { ActivityPrivacyTypeEnum } from "./UserActivity";

export interface ICheckIn extends Document {
  user: mongoose.Types.ObjectId;
  place: mongoose.Types.ObjectId;
  event?: mongoose.Types.ObjectId;
  image?: mongoose.Types.ObjectId;
  tags?: mongoose.Types.ObjectId[];
  caption?: string;
  createdAt: Date;
  userActivityId?: mongoose.Types.ObjectId;
  privacyType: ActivityPrivacyTypeEnum;
}

const CheckInSchema: Schema = new Schema<ICheckIn>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  place: { type: Schema.Types.ObjectId, ref: "Place", required: true },
  event: { type: Schema.Types.ObjectId, ref: "Event" },
  image: { type: Schema.Types.ObjectId, ref: "Media" },
  caption: { type: String },
  tags: [{ type: Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
  userActivityId: { type: Schema.Types.ObjectId, ref: "UserActivity" },
  privacyType: {
    type: String,
    enum: Object.values(ActivityPrivacyTypeEnum),
    default: ActivityPrivacyTypeEnum.PUBLIC,
    required: true,
  },
});

async function removeDependencies(checkin: ICheckIn) {
  // remove the userActivity related to the review
  const userActivity = await UserActivity.findById(checkin.userActivityId);
  if (userActivity) {
    await userActivity.deleteOne();
  }
}

CheckInSchema.pre<ICheckIn>(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      const checkin = this;
      // Find all notifications related to the comment
      await removeDependencies(checkin);

      logger.verbose("decreasing checkin count of the place");
      const placeObject = await Place.findById(checkin.place);
      placeObject.activities.checkinCount =
        placeObject.activities.checkinCount - 1;
      await placeObject.save();

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
    logger.verbose("decreasing checkin count of the place");
    const placeObject = await Place.findById(checkin.place);
    placeObject.activities.checkinCount =
      placeObject.activities.checkinCount - 1;
    await placeObject.save();
    next();
  } catch (error) {
    next(error as CallbackError);
  }
});

export default mongoose.models.CheckIn ||
  mongoose.model<ICheckIn>("CheckIn", CheckInSchema);
