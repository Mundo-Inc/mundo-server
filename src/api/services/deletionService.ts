import { StatusCodes } from "http-status-codes";
import mongoose, { type FilterQuery } from "mongoose";

import Comment, { type IComment } from "../../models/comment.js";
import { ResourceTypeEnum } from "../../models/enum/resourceTypeEnum.js";
import Notification from "../../models/notification.js";
import Reward, { type IReward } from "../../models/reward.js";
import User from "../../models/user/user.js";
import UserActivity from "../../models/userActivity.js";
import { dStrings, dynamicMessage } from "../../strings.js";
import { createError } from "../../utilities/errorHandlers.js";
import logger from "./logger/index.js";
import { calcLevel } from "./reward/helpers/levelCalculations.js";

export default class DeletionService {
  /**
   * Delete a comment and all its children
   * @param id Comment id
   * @param preRun Function to run before deleting the comment
   * - Useful for authorizing the deletion
   * - If the function throws an error, the deletion will be aborted
   */
  static async deleteComment(
    id: mongoose.Types.ObjectId,
    preRun?: (comment: IComment) => void,
  ) {
    const comment = await Comment.findById(id).orFail(
      createError(
        dynamicMessage(dStrings.notFound, "Comment"),
        StatusCodes.NOT_FOUND,
      ),
    );

    if (preRun) {
      preRun(comment);
    }

    await Promise.all([
      comment.deleteOne(),

      // Update UserActivity
      UserActivity.updateOne(
        { _id: comment.userActivity },
        { $inc: { "engagements.comments": -1 } },
      ),

      // Delete children comments
      comment.children.length > 0
        ? Promise.all(
            comment.children.map((c) => DeletionService.deleteComment(c)),
          )
        : Promise.resolve(),

      // Remove from parent's children
      comment.parent
        ? Comment.updateOne(
            { _id: comment.parent },
            { $pull: { children: comment._id } },
          )
        : Promise.resolve(),

      // Delete reward
      DeletionService.deleteReward(comment.author, {
        refType: "Comment",
        refId: comment._id,
        userActivityId: comment.userActivity,
      }).catch((error) => {
        logger.error("Error deleting reward for comment", {
          error,
          data: {
            commentId: comment._id,
            userActivityId: comment.userActivity,
            userId: comment.author,
          },
        });
      }),

      // Delete notifications
      DeletionService.deleteNotifications(id, ResourceTypeEnum.Comment),
    ]);
  }

  private static async deleteNotifications(
    id: mongoose.Types.ObjectId,
    type: ResourceTypeEnum,
  ) {
    await Notification.deleteMany({
      "resources._id": id,
      "resources.type": type,
    });
  }

  private static async deleteReward(
    userId: mongoose.Types.ObjectId,
    reason: {
      refType: string;
      refId: mongoose.Types.ObjectId;
      userActivityId?: mongoose.Types.ObjectId;
      placeId?: mongoose.Types.ObjectId;
    },
  ) {
    const query: FilterQuery<IReward> = {
      userId,
      "reason.refType": reason.refType,
      "reason.refId": reason.refId,
    };

    if (reason.userActivityId) {
      query["reason.userActivityId"] = reason.userActivityId;
    }
    if (reason.placeId) {
      query["reason.placeId"] = reason.placeId;
    }

    const [reward, user] = await Promise.all([
      Reward.findOne(query).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "Reward"),
          StatusCodes.NOT_FOUND,
        ),
      ),
      User.findById(userId).orFail(
        createError(
          dynamicMessage(dStrings.notFound, "User"),
          StatusCodes.NOT_FOUND,
        ),
      ),
    ]);

    user.progress.xp = user.progress.xp - reward.amount;
    user.progress.level = calcLevel(user.progress.xp);

    await Promise.all([user.save(), reward.deleteOne()]);
  }
}
