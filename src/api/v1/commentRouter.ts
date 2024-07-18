import express from "express";

import {
  createComment,
  createCommentValidation,
} from "../controllers/comment/createComment.js";
import {
  deleteComment,
  deleteCommentValidation,
} from "../controllers/comment/deleteComment.js";
import {
  deleteCommentLike,
  deleteCommentLikeValidation,
} from "../controllers/comment/deleteCommentLike.js";
import {
  getCommentReplies,
  getCommentRepliesValidation,
} from "../controllers/comment/getCommentReplies.js";
import {
  likeComment,
  likeCommentValidation,
} from "../controllers/comment/likeComment.js";
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
