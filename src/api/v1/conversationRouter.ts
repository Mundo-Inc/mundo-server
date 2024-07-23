import express from "express";

import {
  createConversation,
  createConversationValidation,
} from "../controllers/conversation/createConversation.js";
import {
  createGroupConversation,
  createGroupConversationValidation,
} from "../controllers/conversation/createGroupConversation.js";
import {
  getConversation,
  getConversationValidation,
} from "../controllers/conversation/getConversation.js";
import { getConversations } from "../controllers/conversation/getConversations.js";
import { getConversationToken } from "../controllers/conversation/getConversationToken.js";
import {
  removeUserFromGroupConversation,
  removeUserFromGroupConversationValidation,
} from "../controllers/conversation/removeUserFromGroupConversation.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

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
  createGroupConversation,
);

router.get("/token", getConversationToken);

router.get("/:id", getConversationValidation, getConversation);

router.delete(
  "/:id/participant",
  removeUserFromGroupConversationValidation,
  removeUserFromGroupConversation,
);

export default router;
