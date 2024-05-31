import express from "express";

import {
  createComment,
  createCommentValidation,
  deleteComment,
  deleteCommentLike,
  deleteCommentLikeValidation,
  deleteCommentValidation,
  getCommentReplies,
  getCommentRepliesValidation,
  likeComment,
  likeCommentValidation,
} from "../controllers/CommentController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.post("/", createCommentValidation, createComment);

router.delete("/:id", deleteCommentValidation, deleteComment);

router.get("/:id/replies", getCommentRepliesValidation, getCommentReplies);

router
  .route("/:id/likes")
  .post(likeCommentValidation, likeComment)
  .delete(deleteCommentLikeValidation, deleteCommentLike);

export default router;
