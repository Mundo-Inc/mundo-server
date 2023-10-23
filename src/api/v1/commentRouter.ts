import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  createComment,
  createCommentValidation,
  deleteCommentLike,
  deleteCommentLikeValidation,
  likeComment,
  likeCommentValidation,
} from "../controllers/CommentController";
import {
  createFlagComment,
  createFlagCommentValidation,
} from "../controllers/FlagController";

const router = express.Router();
router.use(express.json());

router.post("/", authMiddleware, createCommentValidation, createComment);

router
  .route("/:id/likes")
  .post(authMiddleware, likeCommentValidation, likeComment)
  .delete(authMiddleware, deleteCommentLikeValidation, deleteCommentLike);

router
  .route("/:id/flag")
  .post(authMiddleware, createFlagCommentValidation, createFlagComment);

export default router;
