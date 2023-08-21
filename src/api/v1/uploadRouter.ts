import express from "express";

import { uploadFile } from "../controllers/UploadController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();

router.post("/", authMiddleware, uploadFile);

export default router;
