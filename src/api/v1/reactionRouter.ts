import express from "express";

import {
  createReaction,
  createReactionValidation,
  deleteReaction,
  deleteReactionValidation,
} from "../controllers/ReactionController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .post(authMiddleware, createReactionValidation, createReaction);

router
  .route("/:id")
  .delete(authMiddleware, deleteReactionValidation, deleteReaction);

export default router;
