import express from "express";

import { createMedia } from "../controllers/MediaController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();

router.post("/", authMiddleware, createMedia);

export default router;
