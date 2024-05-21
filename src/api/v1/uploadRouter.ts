import express from "express";

import { uploadFile } from "../controllers/UploadController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router.post("/", authMiddleware, uploadFile);

export default router;
