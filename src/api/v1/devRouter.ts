import express from "express";

import { adminAuthMiddleware } from "../middlewares/authMiddleWare";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

// Routes
router.get("/hello", (req, res) => {
  res.send("Hello, Admin!");
});

export default router;
