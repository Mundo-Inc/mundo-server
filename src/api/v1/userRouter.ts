import express from "express";

import {
  acceptFollowRequest,
  acceptFollowRequestValidation,
} from "../controllers/connection/acceptFollowRequest.js";
import {
  connectionFollowStatus,
  connectionFollowStatusValidation,
} from "../controllers/connection/connectionFollowStatus.js";
import {
  createUserConnection,
  createUserConnectionValidation,
} from "../controllers/connection/createUserConnection.js";
import {
  deleteUserConnection,
  deleteUserConnectionValidation,
} from "../controllers/connection/deleteUserConnection.js";
import {
  getFollowRequests,
  getFollowRequestsValidation,
} from "../controllers/connection/getFollowRequests.js";
import {
  getUserConnections,
  getUserConnectionsValidation,
} from "../controllers/connection/getUserConnections.js";
import {
  rejectFollowRequest,
  rejectFollowRequestValidation,
} from "../controllers/connection/rejectFollowRequest.js";
import {
  removeFollower,
  removeFollowerValidation,
} from "../controllers/connection/removeFollower.js";
import {
  blockUser,
  blockUserValidation,
} from "../controllers/user/blockUser.js";
import {
  createUser,
  createUserValidation,
} from "../controllers/user/createUser.js";
import {
  deleteUser,
  deleteUserValidation,
} from "../controllers/user/deleteUser.js";
import { editUser, editUserValidation } from "../controllers/user/editUser.js";
import {
  editUserPrivacy,
  editUserPrivacyValidation,
} from "../controllers/user/editUserPrivacy.js";
import {
  editUserSettings,
  editUserSettingsValidation,
} from "../controllers/user/editUserSettings.js";
import {
  getActivitiesOfaUser,
  getActivitiesOfaUserValidation,
} from "../controllers/user/getActivitiesOfaUser.js";
import {
  getLatestPlace,
  getLatestPlaceValidation,
} from "../controllers/user/getLatestPlace.js";
import {
  getLatestReferredUsers,
  getLatestReferredUsersValidation,
} from "../controllers/user/getLatestReferredUsers.js";
import {
  getLeaderboard,
  getLeaderboardValidation,
} from "../controllers/user/getLeaderboard.js";
import { getUser, getUserValidation } from "../controllers/user/getUser.js";
import {
  getUserLists,
  getUserListsValidation,
} from "../controllers/user/getUserLists.js";
import { getUsers, getUsersValidation } from "../controllers/user/getUsers.js";
import {
  getUsersByIds,
  getUsersByIdsValidation,
} from "../controllers/user/getUsersByIds.js";
import { getUserStats } from "../controllers/user/getUserStats.js";
import {
  unblockUser,
  unblockUserValidation,
} from "../controllers/user/unblockUser.js";
import {
  usernameAvailability,
  usernameAvailabilityValidation,
} from "../controllers/user/usernameAvailability.js";
import { trackAppUsage } from "../middlewares/appUsageMiddleWare.js";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(optionalAuthMiddleware, getUsersValidation, getUsers)
  .post(createUserValidation, createUser);

router.post("/by-ids", getUsersByIdsValidation, getUsersByIds);

router.get("/stats", authMiddleware, trackAppUsage, getUserStats);

router.get(
  "/leaderboard",
  authMiddleware,
  getLeaderboardValidation,
  getLeaderboard,
);

router.get(
  "/username-availability/:username",
  optionalAuthMiddleware,
  usernameAvailabilityValidation,
  usernameAvailability,
);

router.get(
  "/followRequests",
  authMiddleware,
  getFollowRequestsValidation,
  getFollowRequests,
);

router
  .route("/followRequests/:requestId")
  .post(authMiddleware, acceptFollowRequestValidation, acceptFollowRequest)
  .delete(authMiddleware, rejectFollowRequestValidation, rejectFollowRequest);

router.delete(
  "/followers/:userId",
  authMiddleware,
  removeFollowerValidation,
  removeFollower,
);

router.get(
  "/latestReferrals",
  authMiddleware,
  getLatestReferredUsersValidation,
  getLatestReferredUsers,
);

router
  .route("/:id/connections")
  .post(authMiddleware, createUserConnectionValidation, createUserConnection)
  .delete(authMiddleware, deleteUserConnectionValidation, deleteUserConnection);

router.get(
  "/:id/connections/followStatus",
  connectionFollowStatusValidation,
  connectionFollowStatus,
);

router.get(
  "/:id/connections/:type",
  authMiddleware,
  getUserConnectionsValidation,
  getUserConnections,
);

router.put(
  "/:id/privacy",
  authMiddleware,
  editUserPrivacyValidation,
  editUserPrivacy,
);

router.put(
  "/:id/settings",
  authMiddleware,
  editUserSettingsValidation,
  editUserSettings,
);

router.get(
  "/:id/latestplace",
  authMiddleware,
  getLatestPlaceValidation,
  getLatestPlace,
);

router.get("/:id/lists", authMiddleware, getUserListsValidation, getUserLists);

router.get(
  "/:userId/userActivities",
  authMiddleware,
  getActivitiesOfaUserValidation,
  getActivitiesOfaUser,
);

router
  .route("/:id/block")
  .post(authMiddleware, blockUserValidation, blockUser)
  .delete(authMiddleware, unblockUserValidation, unblockUser);

router
  .route("/:id")
  .get(optionalAuthMiddleware, getUserValidation, getUser)
  .put(authMiddleware, editUserValidation, editUser)
  .delete(authMiddleware, deleteUserValidation, deleteUser);

export default router;
