import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  createComment,
  createCommentValidation,
} from "../controllers/CommentController";

const router = express.Router();
router.use(express.json());

router.post("/", authMiddleware, createCommentValidation, createComment);

export default router;
