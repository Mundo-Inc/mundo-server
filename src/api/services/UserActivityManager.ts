import { type Types } from "mongoose";

import { type IUser } from "../../models/User.js";
import UserActivity, {
  ActivityResourceTypeEnum,
  ActivityTypeEnum,
  ResourcePrivacyEnum,
} from "../../models/UserActivity.js";

export class UserActivityManager {
  public static async createFollowActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    targetUserId: Types.ObjectId
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.FOLLOWING,
      resourceId: targetUserId,
      resourceType: ActivityResourceTypeEnum.USER,
      resourcePrivacy: ResourcePrivacyEnum.PUBLIC,
    });
    return activity;
  }

  public static async createLevelUpActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    newLevel: number
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.LEVEL_UP,
      resourceId: user._id,
      resourceType: ActivityResourceTypeEnum.USER,
      resourcePrivacy: ResourcePrivacyEnum.PUBLIC,
      newLevel,
    });
    return activity;
  }

  public static async createCheckInActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    placeId: Types.ObjectId,
    hasMedia: boolean,
    checkInId: Types.ObjectId,
    resourcePrivacy: ResourcePrivacyEnum
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.NEW_CHECKIN,
      resourceId: checkInId,
      resourceType: ActivityResourceTypeEnum.CHECKIN,
      resourcePrivacy,
      placeId,
      hasMedia,
    });
    return activity;
  }

  public static async createReviewActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    placeId: Types.ObjectId,
    hasMedia: boolean,
    reviewId: Types.ObjectId
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.NEW_REVIEW,
      resourceId: reviewId,
      resourceType: ActivityResourceTypeEnum.REVIEW,
      resourcePrivacy: ResourcePrivacyEnum.PUBLIC,
      placeId,
      hasMedia,
    });
    return activity;
  }

  public static async createHomemadeActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    homemadeId: Types.ObjectId
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.NEW_HOMEMADE,
      resourceId: homemadeId,
      resourceType: ActivityResourceTypeEnum.HOMEMADE,
      resourcePrivacy: ResourcePrivacyEnum.PUBLIC,
      hasMedia: true, // TODO: Make sure it has media
    });
    return activity;
  }

  public static async createRecommendedActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    placeId: Types.ObjectId,
    reviewId: Types.ObjectId
  ) {
    // TODO: Check the flow of this activity type
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.NEW_RECOMMEND,
      resourceId: reviewId,
      resourceType: ActivityResourceTypeEnum.REVIEW,
      resourcePrivacy: ResourcePrivacyEnum.PUBLIC,
      placeId,
    });
    return activity;
  }
}
