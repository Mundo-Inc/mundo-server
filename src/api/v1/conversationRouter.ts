import express from "express";

import {
  createConversation,
  createConversationValidation,
  createGroupConversation,
  createGroupConversationValidation,
  getConversation,
  getConversations,
  getConversationValidation,
  getToken,
  removeUserFromGroupConversation,
  removeUserFromGroupConversationValidation,
} from "../controllers/ConversationController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/")
  .get(getConversations)
  .post(createConversationValidation, createConversation);

router.post(
  "/group",
  createGroupConversationValidation,
  createGroupConversation
);

router.get("/token", getToken);

router.get("/:id", getConversationValidation, getConversation);

router.delete(
  "/:id/participant",
  removeUserFromGroupConversationValidation,
  removeUserFromGroupConversation
);

export default router;
