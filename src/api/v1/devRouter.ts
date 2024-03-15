import express from "express";

import {
  notifyUsers,
  notifyUsersValidation,
} from "../controllers/DevController";
import { adminAuthMiddleware } from "../middlewares/authMiddleWare";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

// Routes

router.post("/notify", notifyUsersValidation, notifyUsers);

router.get("/hello", (req, res) => {
  res.send("Hello, Admin!");
});

export default router;
