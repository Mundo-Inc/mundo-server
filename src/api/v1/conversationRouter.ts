import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  createConversation,
  createConversationValidation,
  getConversation,
  getConversations,
  getConversationsValidation,
  getConversationValidation,
  getToken,
  getTokenValidation,
} from "../controllers/ConversationController";

const router = express.Router();
router.use(express.json());

router.get("/token", authMiddleware, getTokenValidation, getToken);

router.get("/:id", authMiddleware, getConversationValidation, getConversation);

router.post(
  "/",
  authMiddleware,
  createConversationValidation,
  createConversation
);

router.get("/", authMiddleware, getConversationsValidation, getConversations);

export default router;
