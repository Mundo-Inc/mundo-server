import express from "express";

import { authMiddleware } from "../middlewares/authMiddleWare";
import {
  getToken,
  getTokenValidation,
} from "../controllers/ConversationController";

const router = express.Router();
router.use(express.json());

router.get("/token", authMiddleware, getTokenValidation, getToken);

export default router;
