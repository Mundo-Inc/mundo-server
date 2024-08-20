import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type { Types } from "mongoose";
import { z } from "zod";

import logger from "../../../api/services/logger/index.js";
import { addReward } from "../../../api/services/reward/reward.service.js";
import { UserActivityManager } from "../../../api/services/userActivityManager.js";
import { ResourceTypeEnum } from "../../../models/enum/resourceTypeEnum.js";
import Follow from "../../../models/follow.js";
import Homemade from "../../../models/homemade.js";
import Media, { MediaTypeEnum } from "../../../models/media.js";
import Notification, {
  NotificationTypeEnum,
} from "../../../models/notification.js";
import Upload from "../../../models/upload.js";
import User, { UserRoleEnum } from "../../../models/user/user.js";
import { ResourcePrivacyEnum } from "../../../models/userActivity.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const body = z.object({
  user: zObjectId.optional(),
  content: z.string().optional(),
  media: z.array(z.object({ uploadId: zObjectId, caption: z.string() })),
  tags: z.array(zObjectId).optional(),
  privacyType: z
    .string()
    .transform((val) => val as ResourcePrivacyEnum)
    .refine(
      (val) =>
        val === ResourcePrivacyEnum.Private ||
        val === ResourcePrivacyEnum.Followers,
    )
    .optional()
    .default(ResourcePrivacyEnum.Public),
});

type Body = z.infer<typeof body>;

export const createHomemadePostValidation = validateData({
  body: body,
});

export async function createHomemadePost(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { content, media, tags, privacyType, user } =
      req.body as unknown as Body;

    const userId = user ?? authUser._id;

    if (!userId.equals(authUser._id) && authUser.role !== UserRoleEnum.Admin) {
      throw createError(strings.authorization.otherUser, StatusCodes.FORBIDDEN);
    }

    const uploadIds: Types.ObjectId[] = [];
    const mediaIds: Types.ObjectId[] = [];

    for (const m of media) {
      const upload = await Upload.findById(m.uploadId).orFail(
        createError(
          dynamicMessage(ds.notFound, "Uploaded media"),
          StatusCodes.NOT_FOUND,
        ),
      );
      if (!authUser._id.equals(upload.user)) {
        throw createError(
          strings.authorization.otherUser,
          StatusCodes.FORBIDDEN,
        );
      }
      uploadIds.push(m.uploadId);

      await Media.create({
        type:
          upload.type === "video" ? MediaTypeEnum.Video : MediaTypeEnum.Image,
        user: authUser._id,
        caption: m.caption,
        src: upload.src,
      }).then(async (media) => {
        mediaIds.push(media._id);
        await Upload.findByIdAndDelete(m.uploadId);
      });
    }

    if (mediaIds.length === 0) {
      throw createError(
        "At least one media (img/vid) should be included",
        StatusCodes.BAD_REQUEST,
      );
    }

    if (tags) {
      logger.verbose("validate tags");
      for (const userId of tags) {
        await User.exists({ _id: userId }).orFail(
          createError("Tagged user does not exist", StatusCodes.NOT_FOUND),
        );
      }
    }

    const homemade = await Homemade.create({
      user: userId,
      content: content || "",
      media: mediaIds,
      tags,
      privacyType: privacyType,
    });

    const reward = await addReward(authUser._id, {
      refType: "Homemade",
      refId: homemade._id,
    });

    //Send notifications to followers
    const followers = await Follow.find({
      target: userId,
    }).lean();

    for (const follower of followers) {
      await Notification.create({
        user: follower.user,
        type: NotificationTypeEnum.FollowingHomemade,
        resources: [
          {
            _id: homemade._id,
            type: ResourceTypeEnum.Homemade,
            date: homemade.createdAt,
          },
        ],
        importance: 2,
      });
    }

    res.status(StatusCodes.CREATED).json(createResponse(homemade));

    try {
      // delete uploads
      await Upload.deleteMany({ _id: { $in: uploadIds } });
    } catch (e) {
      logger.error("Internal server error on deleting upload(s)", { error: e });
    }

    try {
      //TODO: ADD COIN REWARDS TO THE USERS IF APPROVED BY NABZ
      // await reviewEarning(authId, review);
      // const _act = await addHomemadeActivity(authUser._id, homemade._id);
      const activity = await UserActivityManager.createHomemadeActivity(
        authUser,
        homemade._id,
      );
      homemade.userActivityId = activity._id;
      await homemade.save();
    } catch (e) {
      logger.error("Internal server error during creating the review", {
        error: e,
      });
    }
  } catch (err) {
    next(err);
  }
}
