import express from "express";

import {
  block,
  blockValidation,
  unblock,
} from "../controllers/BlockController.js";
import {
  acceptFollowRequest,
  acceptFollowRequestValidation,
  connectionFollowStatus,
  connectionFollowStatusValidation,
  createUserConnection,
  createUserConnectionValidation,
  deleteUserConnection,
  deleteUserConnectionValidation,
  getFollowRequests,
  getFollowRequestsValidation,
  getUserConnections,
  getUserConnectionsValidation,
  rejectFollowRequest,
  rejectFollowRequestValidation,
  removeFollower,
  removeFollowerValidation,
} from "../controllers/ConnectionController.js";
import {
  getUserLists,
  getUserListsValidation,
} from "../controllers/ListController.js";
import {
  getLatestReferredUsers,
  paginationValidation,
} from "../controllers/RewardController.js";
import {
  getActivitiesOfaUser,
  getActivitiesOfaUserValidation,
} from "../controllers/UserActivityController.js";
import {
  createUser,
  createUserValidation,
  deleteUser,
  deleteUserValidation,
  editUser,
  editUserValidation,
  getLatestPlace,
  getLatestPlaceValidation,
  getLeaderBoard,
  getUser,
  getUserValidation,
  getUsers,
  getUsersByIds,
  getUsersByIdsValidation,
  getUsersValidation,
  leaderBoardValidation,
  putUserPrivacy,
  putUserSettings,
  userPrivacyValidation,
  userSettingsValidation,
  usernameAvailability,
  usernameAvailabilityValidation,
} from "../controllers/UserController.js";
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

router.get(
  "/leaderboard",
  authMiddleware,
  leaderBoardValidation,
  getLeaderBoard
);

router.get(
  "/username-availability/:username",
  optionalAuthMiddleware,
  usernameAvailabilityValidation,
  usernameAvailability
);

router.get(
  "/followRequests",
  authMiddleware,
  getFollowRequestsValidation,
  getFollowRequests
);

router
  .route("/followRequests/:requestId")
  .post(authMiddleware, acceptFollowRequestValidation, acceptFollowRequest)
  .delete(authMiddleware, rejectFollowRequestValidation, rejectFollowRequest);

router.delete(
  "/followers/:userId",
  authMiddleware,
  removeFollowerValidation,
  removeFollower
);

router.get(
  "/latestReferrals",
  authMiddleware,
  paginationValidation,
  getLatestReferredUsers
);

router
  .route("/:id/connections")
  .post(authMiddleware, createUserConnectionValidation, createUserConnection)
  .delete(authMiddleware, deleteUserConnectionValidation, deleteUserConnection);

router.get(
  "/:id/connections/followStatus",
  connectionFollowStatusValidation,
  connectionFollowStatus
);

router.get(
  "/:id/connections/:type",
  authMiddleware,
  getUserConnectionsValidation,
  getUserConnections
);

router.put(
  "/:id/privacy",
  authMiddleware,
  userPrivacyValidation,
  putUserPrivacy
);

router.put(
  "/:id/settings",
  authMiddleware,
  userSettingsValidation,
  putUserSettings
);

router.get(
  "/:id/latestplace",
  authMiddleware,
  getLatestPlaceValidation,
  getLatestPlace
);

router.get("/:id/lists", authMiddleware, getUserListsValidation, getUserLists);

router.get(
  "/:id/userActivities",
  authMiddleware,
  getActivitiesOfaUserValidation,
  getActivitiesOfaUser
);

router
  .route("/:id/block")
  .post(authMiddleware, blockValidation, block)
  .delete(authMiddleware, blockValidation, unblock);

router
  .route("/:id")
  .get(optionalAuthMiddleware, getUserValidation, getUser)
  .put(authMiddleware, editUserValidation, editUser)
  .delete(authMiddleware, deleteUserValidation, deleteUser);

export default router;
