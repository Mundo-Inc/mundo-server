import { type Types } from "mongoose";

import { ResourceTypeEnum } from "../../models/_enum/ResourceTypeEnum.js";
import { type IUser } from "../../models/user/user.js";
import UserActivity, {
  ActivityTypeEnum,
  ResourcePrivacyEnum,
} from "../../models/UserActivity.js";

export class UserActivityManager {
  public static async createFollowActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    targetUserId: Types.ObjectId,
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.Following,
      resourceId: targetUserId,
      resourceType: ResourceTypeEnum.User,
      resourcePrivacy: ResourcePrivacyEnum.Public,
    });
    return activity;
  }

  public static async createLevelUpActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    newLevel: number,
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.LevelUp,
      resourceId: user._id,
      resourceType: ResourceTypeEnum.User,
      resourcePrivacy: ResourcePrivacyEnum.Public,
      newLevel,
    });
    return activity;
  }

  public static async createCheckInActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    placeId: Types.ObjectId,
    hasMedia: boolean,
    checkInId: Types.ObjectId,
    resourcePrivacy: ResourcePrivacyEnum,
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.NewCheckIn,
      resourceId: checkInId,
      resourceType: ResourceTypeEnum.CheckIn,
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
    reviewId: Types.ObjectId,
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.NewReview,
      resourceId: reviewId,
      resourceType: ResourceTypeEnum.Review,
      resourcePrivacy: ResourcePrivacyEnum.Public,
      placeId,
      hasMedia,
    });
    return activity;
  }

  public static async createHomemadeActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    homemadeId: Types.ObjectId,
  ) {
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.NewHomemade,
      resourceId: homemadeId,
      resourceType: ResourceTypeEnum.Homemade,
      resourcePrivacy: ResourcePrivacyEnum.Public,
      hasMedia: true, // TODO: Make sure it has media
    });
    return activity;
  }

  public static async createRecommendedActivity(
    user: Pick<IUser, "_id" | "isPrivate">,
    placeId: Types.ObjectId,
    reviewId: Types.ObjectId,
  ) {
    // TODO: Check the flow of this activity type
    const activity = await UserActivity.create({
      userId: user._id,
      isAccountPrivate: user.isPrivate,
      activityType: ActivityTypeEnum.NewRecommend,
      resourceId: reviewId,
      resourceType: ResourceTypeEnum.Review,
      resourcePrivacy: ResourcePrivacyEnum.Public,
      placeId,
    });
    return activity;
  }
}
