import express from "express";

import {
  createUser,
  createUserConnection,
  createUserConnectionValidation,
  createUserValidation,
  deleteUser,
  deleteUserConnection,
  deleteUserConnectionValidation,
  deleteUserValidation,
  editUser,
  editUserValidation,
  getLatestPlace,
  getLatestPlaceValidation,
  getLeaderBoard,
  getUser,
  getUserConnections,
  getUserConnectionsValidation,
  getUserValidation,
  getUsers,
  getUsersValidation,
  leaderBoardValidation,
  putUserSettings,
  userSettingsValidation,
  usernameAvailability,
  usernameAvailabilityValidation,
} from "../controllers/UserController";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleWare";
import {
  getActivitiesOfaUser,
  getActivitiesOfaUserValidation,
} from "../controllers/UserActivityController";
import {
  block,
  blockValidation,
  unblock,
} from "../controllers/BlockController";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getUsersValidation, getUsers)
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

router
  .route("/:id")
  .put(authMiddleware, editUserValidation, editUser)
  .get(authMiddleware, getUserValidation, getUser)
  .delete(authMiddleware, deleteUserValidation, deleteUser);

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

router.get(
  "/:id/connections/:type",
  authMiddleware,
  getUserConnectionsValidation,
  getUserConnections
);

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
