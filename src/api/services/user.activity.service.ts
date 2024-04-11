import UserActivity, {
  ActivityPrivacyTypeEnum,
  ActivityResourceTypeEnum,
  ActivityTypeEnum,
} from "../../models/UserActivity";

const addActivity = async (params: any, existCheck: boolean = false) => {
  let activity;
  if (existCheck) {
    activity = await UserActivity.findOne(params);
    if (activity) return null;
  }
  activity = await UserActivity.create(params);
  return activity;
};

export const addNewPlaceActivity = async (
  userId: string,
  placeId: string,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC,
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.ADD_PLACE,
    resourceType: ActivityResourceTypeEnum.PLACE,
    resourceId: placeId,
    placeId,
    privacyType,
  };
  if (createdAt) {
    activityParams.createdAt = createdAt;
  }
  return await addActivity(activityParams, true);
};

export const addCheckinActivity = async (
  userId: string,
  checkinId: string,
  placeId: string | null = null,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC,
  hasMedia: boolean,
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.NEW_CHECKIN,
    resourceType: ActivityResourceTypeEnum.CHECKIN,
    resourceId: checkinId,
    placeId,
    hasMedia,
    privacyType,
  };
  if (createdAt) {
    activityParams.createdAt = createdAt;
  }
  return await addActivity(activityParams, true);
};

export const addReviewActivity = async (
  userId: string,
  reviewId: string,
  placeId: string | null = null,
  hasMedia: boolean = false,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC,
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.NEW_REVIEW,
    resourceType: ActivityResourceTypeEnum.REVIEW,
    resourceId: reviewId,
    placeId,
    hasMedia,
    privacyType,
  };
  if (createdAt) {
    activityParams.createdAt = createdAt;
  }
  return await addActivity(activityParams, true);
};

export const addHomemadeActivity = async (
  userId: string,
  homemadeId: string,
  hasMedia: boolean = true,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC,
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.NEW_HOMEMADE,
    resourceType: ActivityResourceTypeEnum.HOMEMADE,
    resourceId: homemadeId,
    hasMedia,
    privacyType,
  };
  if (createdAt) {
    activityParams.createdAt = createdAt;
  }
  return await addActivity(activityParams, true);
};

export const addRecommendActivity = async (
  userId: string,
  reviewId: string,
  placeId: string | null = null,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC
) => {
  const activityParams = {
    userId,
    activityType: ActivityTypeEnum.NEW_RECOMMEND,
    resourceType: ActivityResourceTypeEnum.REVIEW,
    resourceId: reviewId,
    placeId,
    privacyType,
  };
  return await addActivity(activityParams, true);
};

export const addReactionToPlaceActivity = async (
  userId: string,
  reactionId: string,
  placeId: string | null = null,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC,
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.REACT_TO_PLACE,
    resourceType: ActivityResourceTypeEnum.REACTION,
    resourceId: reactionId,
    placeId,
    privacyType,
  };
  if (createdAt) {
    activityParams.createdAt = createdAt;
  }
  return await addActivity(activityParams, true);
};

export const addGotBadgeActivity = async (
  userId: string,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC
) => {
  const activityParams = {
    userId,
    activityType: ActivityTypeEnum.GOT_BADGE,
    resourceType: ActivityResourceTypeEnum.USER,
    resourceId: userId,
    privacyType,
  };
  return await addActivity(activityParams, true);
};

export const addLevelUpActivity = async (
  userId: string,
  newLevel: number,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC
) => {
  const activityParams = {
    userId,
    activityType: ActivityTypeEnum.LEVEL_UP,
    resourceType: ActivityResourceTypeEnum.USER,
    resourceId: userId,
    privacyType,
    newLevel,
  };
  return await UserActivity.create(activityParams);
};

export const addNewFollowingActivity = async (
  userId: string,
  targetId: string,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC,
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.FOLLOWING,
    resourceType: ActivityResourceTypeEnum.USER,
    resourceId: targetId,
    privacyType,
  };
  if (createdAt) {
    activityParams.createdAt = createdAt;
  }
  return await addActivity(activityParams, true);
};
