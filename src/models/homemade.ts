import mongoose, { Schema, type CallbackError, type Model } from "mongoose";

import DeletionService from "../api/services/deletionService.js";
import logger from "../api/services/logger/index.js";
import Comment from "./comment.js";
import Media from "./media.js";
import Reaction from "./reaction.js";
import UserActivity, { ResourcePrivacyEnum } from "./userActivity.js";

export interface IHomemade {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  content: string;
  media: mongoose.Types.ObjectId[];
  tags?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  userActivityId?: mongoose.Types.ObjectId;
  privacyType: ResourcePrivacyEnum;
}

const HomemadeSchema = new Schema<IHomemade>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, default: "" },
    media: {
      type: [{ type: Schema.Types.ObjectId, ref: "Media" }],
      default: [],
    },
    tags: [{ type: Schema.Types.ObjectId, ref: "User" }],
    userActivityId: { type: Schema.Types.ObjectId, ref: "UserActivity" },
    privacyType: {
      type: String,
      enum: Object.values(ResourcePrivacyEnum),
      default: ResourcePrivacyEnum.Public,
      required: true,
    },
  },
  { timestamps: true },
);

// dependency removal function
async function removeHomemadeDependencies(homemade: IHomemade) {
  // remove all reactions related to the homemade
  const reactions = await Reaction.find({ target: homemade.userActivityId });
  await Promise.all(reactions.map((reaction) => reaction.deleteOne()));

  // remove all comments related to the homemade
  const comments = await Comment.find({
    userActivity: homemade.userActivityId,
  });
  await Promise.all(
    comments.map((comment) => DeletionService.deleteComment(comment._id)),
  );

  // remove the userActivity related to the homemade
  const userActivity = await UserActivity.findById(homemade.userActivityId);
  if (userActivity) {
    await userActivity.deleteOne();
  }

  // remove all media related to the homemade
  for (const m of homemade.media) {
    const media = await Media.findById(m);
    if (media) {
      await media.deleteOne();
    }
  }
}

// Middleware for homemade.deleteOne (document)
HomemadeSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      await removeHomemadeDependencies(this);

      next();
    } catch (error) {
      logger.error(`Error in deleteOne middleware for document: ${error}`);
      next(error as CallbackError);
    }
  },
);

// Middleware for homemade.deleteOne (query)
HomemadeSchema.pre(
  "deleteOne",
  { query: true, document: false },
  async function (next) {
    try {
      const homemade = await this.model.findOne(this.getQuery());
      if (!homemade) {
        logger.warn("Homemade post not found in deleteOne query middleware.");
        return next();
      }
      await removeHomemadeDependencies(homemade);
      next();
    } catch (error) {
      logger.error(`Error in deleteOne middleware for query: ${error}`);
      next(error as CallbackError);
    }
  },
);

const Homemade =
  (mongoose.models.Homemade as Model<IHomemade>) ||
  mongoose.model<IHomemade>("Homemade", HomemadeSchema);

export default Homemade;
