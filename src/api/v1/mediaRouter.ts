import express from "express";

import {
  getMedia,
  getMediaValidation,
} from "../controllers/MediaController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.get("/", getMediaValidation, getMedia);

export default router;
