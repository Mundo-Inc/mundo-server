import { schedule } from "node-cron";

import logger from "../api/services/logger/index.js";
import { OpenAIService } from "../api/services/openAIService.js";
import { env } from "../env.js";
import CheckIn from "../models/CheckIn.js";
import Comment from "../models/Comment.js";
import Review from "../models/Review.js";
import ScheduledTask, {
  ScheduledTaskStatus,
  ScheduledTaskType,
} from "../models/ScheduledTask.js";
import UserActivity, {
  ActivityTypeEnum,
  ResourcePrivacyEnum,
} from "../models/UserActivity.js";

// evey 3 minutes
schedule(
  "*/3 * * * *",
  async () => {
    const tasks = await ScheduledTask.find({
      status: ScheduledTaskStatus.Pending,
      scheduledAt: { $lte: new Date() },
    });

    for (const task of tasks) {
      try {
        switch (task.type) {
          case ScheduledTaskType.CommentOnActivity:
            const activity = await UserActivity.findById(
              task.resourceId,
            ).orFail(
              new Error(`Activity not found with id ${task.resourceId}`),
            );

            if (activity.resourcePrivacy !== ResourcePrivacyEnum.Public) {
              await ScheduledTask.deleteOne({ _id: task._id });
              continue;
            }

            if (activity.activityType === ActivityTypeEnum.NewCheckIn) {
              const checkIn = await CheckIn.findById(activity.resourceId)
                .orFail(
                  new Error(`CheckIn not found with id ${activity.resourceId}`),
                )
                .lean();

              if (checkIn.privacyType === ResourcePrivacyEnum.Public) {
                const content =
                  await OpenAIService.getInstance().makeACommentOnCheckIn(
                    checkIn,
                  );

                if (content && content !== "-") {
                  // Create comment
                  await Comment.create({
                    author: env.MUNDO_USER_ID,
                    userActivity: checkIn.userActivityId,
                    content: content,
                  });

                  // update comments count in user activity
                  activity.engagements.comments += 1;
                  await activity.save();
                }
              }
            } else if (activity.activityType === ActivityTypeEnum.NewReview) {
              const review = await Review.findById(activity.resourceId)
                .orFail(
                  new Error(`Review not found with id ${activity.resourceId}`),
                )
                .lean();

              // AI Comment
              const content =
                await OpenAIService.getInstance().makeACommentOnReview(review);

              if (content && content !== "-") {
                // Create comment
                await Comment.create({
                  author: env.MUNDO_USER_ID,
                  userActivity: review.userActivityId,
                  content: content,
                });

                // update comments count in user activity
                activity.engagements.comments += 1;
                await activity.save();
              }
            }

            break;
          case ScheduledTaskType.ReplyToComment:
            const comment = await Comment.findById(task.resourceId).orFail(
              new Error(`Comment not found with id ${task.resourceId}`),
            );

            const reply =
              await OpenAIService.getInstance().replyToComment(comment);

            if (reply && reply !== "-") {
              // Create comment
              const newCm = await Comment.create({
                author: env.MUNDO_USER_ID,
                rootComment: comment.rootComment || comment._id,
                parent: comment._id,
                userActivity: comment.userActivity,
                content: reply,
              });

              comment.children.push(newCm._id);
              await comment.save();

              // update comments count in user activity
              await UserActivity.updateOne(
                { _id: comment.userActivity },
                { $inc: { "engagements.comments": 1 } },
              );
            }
            break;
          default:
            break;
        }

        await ScheduledTask.deleteOne({ _id: task._id });
      } catch (error) {
        logger.error("Error running scheduled task", error);
        await ScheduledTask.updateOne(
          { _id: task._id },
          { status: ScheduledTaskStatus.Failed },
        );
      }
    }
  },
  { runOnInit: true },
);
