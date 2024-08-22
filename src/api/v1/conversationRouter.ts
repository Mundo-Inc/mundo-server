import express from "express";

import {
  createConversation,
  createConversationValidation,
} from "../controllers/conversation/createConversation.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.post("/", createConversationValidation, createConversation);

export default router;
