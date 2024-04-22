import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  createConversation,
  createConversationValidation,
  createGroupConversation,
  createGroupConversationValidation,
  getConversation,
  getConversations,
  getConversationsValidation,
  getConversationValidation,
  getToken,
  getTokenValidation,
  removeUserFromGroupConversation,
  removeUserFromGroupConversationValidation,
} from "../controllers/ConversationController";

const router = express.Router();
router.use(express.json());

router.get("/token", authMiddleware, getTokenValidation, getToken);

router.delete(
  "/:id/participant",
  authMiddleware,
  removeUserFromGroupConversationValidation,
  removeUserFromGroupConversation
);
router.get("/:id", authMiddleware, getConversationValidation, getConversation);

router.post(
  "/",
  authMiddleware,
  createConversationValidation,
  createConversation
);

router.get("/", authMiddleware, getConversationsValidation, getConversations);

router.post(
  "/group",
  authMiddleware,
  createGroupConversationValidation,
  createGroupConversation
);

export default router;
