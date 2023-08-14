import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  createReaction,
  createReactionValidation,
  deleteReaction,
  deleteReactionValidation,
} from "../controllers/ReactionController";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .post(authMiddleware, createReactionValidation, createReaction);

router
  .route("/:id")
  .delete(authMiddleware, deleteReactionValidation, deleteReaction);

export default router;
