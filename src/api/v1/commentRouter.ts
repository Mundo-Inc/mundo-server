import express from "express";

import {
  createComment,
  createCommentValidation,
  deleteCommentLike,
  deleteCommentLikeValidation,
  likeComment,
  likeCommentValidation,
} from "../controllers/CommentController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.post("/", createCommentValidation, createComment);

router
  .route("/:id/likes")
  .post(likeCommentValidation, likeComment)
  .delete(deleteCommentLikeValidation, deleteCommentLike);

export default router;
