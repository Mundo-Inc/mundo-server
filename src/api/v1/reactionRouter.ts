import express from "express";

import {
  createReaction,
  createReactionValidation,
} from "../controllers/reaction/createReaction.js";
import {
  deleteReaction,
  deleteReactionValidation,
} from "../controllers/reaction/deleteReaction.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.post("/", createReactionValidation, createReaction);

router.delete("/:id", deleteReactionValidation, deleteReaction);

export default router;
