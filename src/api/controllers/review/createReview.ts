import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { Types } from "mongoose";
import { z } from "zod";

import {
  addEarnings,
  EarningsType,
} from "../../../api/services/earning.service.js";
import logger from "../../../api/services/logger/index.js";
import { addReward } from "../../../api/services/reward/reward.service.js";
import { UserActivityManager } from "../../../api/services/UserActivityManager.js";
import { ResourceTypeEnum } from "../../../models/enum/resourceTypeEnum.js";
import Follow from "../../../models/Follow.js";
import type { IMedia } from "../../../models/Media.js";
import Media from "../../../models/Media.js";
import Notification, {
  NotificationTypeEnum,
} from "../../../models/Notification.js";
import Place from "../../../models/Place.js";
import Review from "../../../models/Review.js";
import ScheduledTask, {
  ScheduledTaskStatus,
  ScheduledTaskType,
} from "../../../models/ScheduledTask.js";
import Upload from "../../../models/Upload.js";
import User from "../../../models/user/user.js";
import { ResourcePrivacyEnum } from "../../../models/UserActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { getRandomDateInRange } from "../../../utilities/dateTime.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { shouldBotInteract } from "../../../utilities/mundo.js";
import { openAiAnalyzeReview } from "../../../utilities/openAi.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";
import { sendSlackMessage } from "../SlackController.js";

const body = z.object({
  place: zObjectId,
  writer: zObjectId.optional(),
  scores: z
    .object({
      overall: z.number().min(0).max(5).optional(),
      drinkQuality: z.number().min(0).max(5).optional(),
      foodQuality: z.number().min(0).max(5).optional(),
      service: z.number().min(0).max(5).optional(),
      atmosphere: z.number().min(0).max(5).optional(),
      value: z.number().min(0).max(5).optional(),
    })
    .optional(),
  content: z.string().trim().optional().default(""),
  images: z
    .array(z.object({ uploadId: zObjectId, caption: z.string() }))
    .optional(),
  videos: z
    .array(z.object({ uploadId: zObjectId, caption: z.string() }))
    .optional(),
  media: z
    .array(z.object({ uploadId: zObjectId, caption: z.string() }))
    .optional(),
  language: z.string().optional(),
  recommend: z.boolean().optional(),
  privacyType: z
    .nativeEnum(ResourcePrivacyEnum)
    .optional()
    .default(ResourcePrivacyEnum.Public),
});

type Body = z.infer<typeof body>;

export const createReviewValidation = validateData({
  body: body,
});

export async function createReview(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const {
      place: placeId,
      writer: inputWriter,
      scores,
      language,
      content,
      recommend,
      images,
      videos,
      media: inputMedia,
      privacyType,
    } = req.body as unknown as Body;

    const media = inputMedia ?? [...(images ?? []), ...(videos ?? [])];

    const writer = inputWriter ?? authUser._id;

    if (!authUser._id.equals(writer) && authUser.role !== "admin") {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    const place = await Place.findById(placeId).orFail(
      createError(dynamicMessage(ds.notFound, "Place"), StatusCodes.NOT_FOUND),
    );

    if (authUser.role !== "admin") {
      const lastReviewExists = await Review.exists({
        writer,
        place: placeId,
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (lastReviewExists) {
        throw createError(
          "You can't review the same place within 24 hours",
          StatusCodes.CONFLICT,
        );
      }
    }

    const uploadIds: Types.ObjectId[] = [];
    const mediaDocs: IMedia[] = [];
    if (media) {
      for (const m of media) {
        const upload = await Upload.findById(m.uploadId)
          .orFail(
            createError(
              dynamicMessage(ds.notFound, `Upload ${m.uploadId}`),
              StatusCodes.NOT_FOUND,
            ),
          )
          .lean();

        if (!authUser._id.equals(upload.user)) {
          throw createError(
            strings.authorization.otherUser,
            StatusCodes.FORBIDDEN,
          );
        }

        uploadIds.push(m.uploadId);

        const media = await Media.create({
          type: upload.type,
          user: authUser._id,
          place: placeId,
          caption: m.caption,
          src: upload.src,
        });

        mediaDocs.push(media);
        await Upload.findByIdAndDelete(m.uploadId);
      }
    }

    const review = await Review.create({
      writer,
      place: placeId,
      scores,
      content: content || "",
      language: language || "en",
      recommend: recommend,
      privacyType: privacyType,
      ...(mediaDocs.length < 0 ? {} : { media: mediaDocs.map((m) => m._id) }),
    });

    // TODO: use websocket to send reward changes
    const reward = await addReward(authUser._id, {
      refType: "Review",
      refId: review._id,
      placeId: placeId,
    });

    res.status(StatusCodes.CREATED).json(createResponse(review));

    place.activities.reviewCount += 1;
    await place.save();

    await User.updateOne({ _id: authUser._id }, { latestPlace: placeId });

    //Send notifications to followers
    const followers = await Follow.find({
      target: writer,
    }).lean();

    await Promise.all(
      followers.map((follower) =>
        Notification.create({
          user: follower.user,
          type: NotificationTypeEnum.FollowingReview,
          resources: [
            {
              _id: review._id,
              type: ResourceTypeEnum.Review,
              date: review.createdAt,
            },
          ],
          importance: 2,
        }),
      ),
    );

    try {
      let activity;
      if (media.length == 0 && !content) {
        // activity = await addRecommendActivity(authUser._id, review._id, place);
        activity = await UserActivityManager.createRecommendedActivity(
          authUser,
          placeId,
          review._id,
        );
      } else {
        activity = await UserActivityManager.createReviewActivity(
          authUser,
          placeId,
          media.length > 0,
          review._id,
        );
      }
      if (activity) {
        review.userActivityId = activity._id;
        //TODO: send notification to the follower + nearby users if they haven't seen the post.
        await review.save();
      }

      // add earnings (usd)
      if (media.length > 0) {
        await addEarnings(
          authUser._id,
          EarningsType.MEDIA_INCLUDED_USER_ACTIVITY,
        );
      }
    } catch (e) {
      logger.error("Internal server error during creating the review", {
        error: e,
      });
    }

    if (content && content.length > 8) {
      openAiAnalyzeReview(content).then(async ({ error, tags }) => {
        if (error) {
          logger.error("Error analyzing review with OpenAI", { error });
        }
        review.tags = tags;
        await review.save();
        place.processReviews();
      });
    } else {
      place.processReviews();
    }

    // AI Comment
    if (await shouldBotInteract(writer)) {
      await ScheduledTask.create({
        status: ScheduledTaskStatus.Pending,
        type: ScheduledTaskType.CommentOnActivity,
        resourceId: review.userActivityId,
        scheduledAt: getRandomDateInRange(60 * 60 * 3, 60 * 5),
      });
    }

    await sendSlackMessage(
      "phantomAssistant",
      `New review from ${authUser.name}\n${mediaDocs && mediaDocs.length > 0 ? mediaDocs.length : "no"} media`,
    );
  } catch (err) {
    next(err);
  }
}
