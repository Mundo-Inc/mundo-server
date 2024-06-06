import mongoose, {
  Schema,
  type CallbackError,
  type Model,
  type Types,
} from "mongoose";

import logger from "../api/services/logger/index.js";
import Media from "./Media.js";
import Place from "./Place.js";
import UserActivity, { ResourcePrivacyEnum } from "./UserActivity.js";

export interface ICheckIn {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  place: Types.ObjectId;
  event?: Types.ObjectId;
  image?: Types.ObjectId;
  tags: Types.ObjectId[];
  caption?: string;
  createdAt: Date;
  userActivityId?: Types.ObjectId;
  privacyType: ResourcePrivacyEnum;
}

const CheckInSchema = new Schema<ICheckIn>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  place: { type: Schema.Types.ObjectId, ref: "Place", required: true },
  event: { type: Schema.Types.ObjectId, ref: "Event" },
  image: { type: Schema.Types.ObjectId, ref: "Media" },
  caption: { type: String },
  tags: {
    type: [{ type: Schema.Types.ObjectId, ref: "User" }],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
  userActivityId: { type: Schema.Types.ObjectId, ref: "UserActivity" },
  privacyType: {
    type: String,
    enum: Object.values(ResourcePrivacyEnum),
    default: ResourcePrivacyEnum.Public,
    required: true,
  },
});

async function removeDependencies(checkin: ICheckIn) {
  // remove the userActivity related to the review
  const userActivity = await UserActivity.findById(checkin.userActivityId);
  if (userActivity) {
    await userActivity.deleteOne();
  }
  if (checkin.image) {
    const media = await Media.findById(checkin.image);
    if (media) {
      await media.deleteOne();
    }
  }
}

CheckInSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      // Find all notifications related to the comment
      await removeDependencies(this);

      logger.verbose("decreasing checkin count of the place");

      await Place.updateOne(
        { _id: this.place },
        { $inc: { "activities.checkinCount": -1 } }
      );

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

    await Place.updateOne(
      { _id: checkin.place },
      { $inc: { "activities.checkinCount": -1 } }
    );

    next();
  } catch (error) {
    next(error as CallbackError);
  }
});

const CheckIn =
  (mongoose.models.CheckIn as Model<ICheckIn>) ||
  mongoose.model<ICheckIn>("CheckIn", CheckInSchema);

export default CheckIn;
