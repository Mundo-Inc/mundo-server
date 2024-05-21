import express from "express";

import {
  createMedia,
  getMedia,
  getMediaValidation,
} from "../controllers/MediaController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();

router
  .route("/")
  .get(authMiddleware, getMediaValidation, getMedia)
  .post(authMiddleware, createMedia);

export default router;
