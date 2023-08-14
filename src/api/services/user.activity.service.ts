import UserActivity, {
  ActivityPrivacyTypeEnum,
  ActivityTypeEnum,
  ResourceTypeEnum,
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
    resourceType: ResourceTypeEnum.PLACE,
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
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.NEW_CHECKIN,
    resourceType: ResourceTypeEnum.CHECKIN,
    resourceId: checkinId,
    placeId,
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
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC,
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.NEW_REVIEW,
    resourceType: ResourceTypeEnum.REVIEW,
    resourceId: reviewId,
    placeId,
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
    resourceType: ResourceTypeEnum.REVIEW,
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
    resourceType: ResourceTypeEnum.REACTION,
    resourceId: reactionId,
    placeId,
    privacyType,
  };
  if (createdAt) {
    activityParams.createdAt = createdAt;
  }
  return await addActivity(activityParams, true);
};

export const addCreateDealActivity = async (
  userId: string,
  dealId: string,
  placeId: string | null = null,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC,
  createdAt?: Date
) => {
  const activityParams: {
    [key: string]: any;
  } = {
    userId,
    activityType: ActivityTypeEnum.CREATE_DEAL,
    resourceType: ResourceTypeEnum.DEAL,
    resourceId: dealId,
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
    resourceType: ResourceTypeEnum.USER,
    resourceId: userId,
    privacyType,
  };
  return await addActivity(activityParams, true);
};

export const addLevelUpActivity = async (
  userId: string,
  privacyType: string = ActivityPrivacyTypeEnum.PUBLIC
) => {
  const activityParams = {
    userId,
    activityType: ActivityTypeEnum.LEVEL_UP,
    resourceType: ResourceTypeEnum.USER,
    resourceId: userId,
    privacyType,
  };
  return await addActivity(activityParams, true);
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
    resourceType: ResourceTypeEnum.USER,
    resourceId: targetId,
    privacyType,
  };
  if (createdAt) {
    activityParams.createdAt = createdAt;
  }
  return await addActivity(activityParams, true);
};
