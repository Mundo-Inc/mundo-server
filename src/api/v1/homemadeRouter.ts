import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  createHomemadePost,
  createHomemadeValidationPost,
  getHomemadePost,
  getHomemadePostValidation,
  getHomemadePosts,
  getHomemadePostsValidation,
  removeHomemadePost,
  removeHomemadePostValidation,
} from "../controllers/HomemadeController";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getHomemadePostsValidation, getHomemadePosts)
  .post(authMiddleware, createHomemadeValidationPost, createHomemadePost);

router
  .route("/:id")
  .get(authMiddleware, getHomemadePostValidation, getHomemadePost)
  .delete(authMiddleware, removeHomemadePostValidation, removeHomemadePost);

//FIXME: WE MIGHT WANT TO MOVE FLAGS TO USERACTIVITIES INSETEAD OF REVIEWS . CUZ CHECKINS + HOMEMADES CAN HAVE HARMFULL CONTENT
// router
//   .route("/:id/flag")
//   .post(authMiddleware, createFlagReviewValidation, createFlagReview);

export default router;
