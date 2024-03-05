import express from "express";

import {
  block,
  blockValidation,
  unblock,
} from "../controllers/BlockController";
import {
  acceptConnectionRequest,
  acceptConnectionRequestValidation,
  connectionFollowStatus,
  connectionFollowStatusValidation,
  createUserConnection,
  createUserConnectionValidation,
  deleteUserConnection,
  deleteUserConnectionValidation,
  getPendingConnections,
  getPendingConnectionsValidation,
  getUserConnections,
  getUserConnectionsValidation,
} from "../controllers/ConnectionController";
import {
  getUserLists,
  getUserListsValidation,
} from "../controllers/ListController";
import {
  getLatestReferredUsers,
  paginationValidation,
} from "../controllers/RewardController";
import {
  getActivitiesOfaUser,
  getActivitiesOfaUserValidation,
} from "../controllers/UserActivityController";
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
  getUsersValidation,
  leaderBoardValidation,
  putUserPrivacy,
  putUserSettings,
  userPrivacyValidation,
  userSettingsValidation,
  usernameAvailability,
  usernameAvailabilityValidation,
} from "../controllers/UserController";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(optionalAuthMiddleware, getUsersValidation, getUsers)
  .post(createUserValidation, createUser);

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

router.post(
  "/acceptConnection",
  authMiddleware,
  acceptConnectionRequestValidation,
  acceptConnectionRequest
);

router.get(
  "/pendingConnections",
  authMiddleware,
  getPendingConnectionsValidation,
  getPendingConnections
);

router.get(
  "/latestReferrals",
  authMiddleware,
  paginationValidation,
  getLatestReferredUsers
);

router
  .route("/:id")
  .get(optionalAuthMiddleware, getUserValidation, getUser)
  .put(authMiddleware, editUserValidation, editUser)
  .delete(authMiddleware, deleteUserValidation, deleteUser);

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

router
  .route("/:id/connections")
  .post(authMiddleware, createUserConnectionValidation, createUserConnection)
  .delete(authMiddleware, deleteUserConnectionValidation, deleteUserConnection);

router
  .route("/:id/connections/followStatus")
  .get(
    authMiddleware,
    connectionFollowStatusValidation,
    connectionFollowStatus
  );

router.get(
  "/:id/connections/:type",
  authMiddleware,
  getUserConnectionsValidation,
  getUserConnections
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

export default router;
