import express from "express";

import {
  createConversation,
  createConversationValidation,
} from "../controllers/conversation/createConversation.js";
import {
  deleteConversation,
  deleteConversationValidation,
} from "../controllers/conversation/deleteConversation.js";
import {
  getConversation,
  getConversationValidation,
} from "../controllers/conversation/getConversation.js";
import {
  getConversationMessages,
  getConversationMessagesValidation,
} from "../controllers/conversation/getConversationMessages.js";
import {
  getConversations,
  getConversationsValidation,
} from "../controllers/conversation/getConversations.js";
import {
  getConversationWith,
  getConversationWithValidation,
} from "../controllers/conversation/getConversationWith.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/")
  .get(getConversationsValidation, getConversations)
  .post(createConversationValidation, createConversation);

router
  .route("/with/:userId")
  .get(getConversationWithValidation, getConversationWith);

router
  .route("/:conversationId")
  .get(getConversationValidation, getConversation)
  .delete(deleteConversationValidation, deleteConversation);

router
  .route("/:conversationId/messages")
  .get(getConversationMessagesValidation, getConversationMessages);

export default router;
