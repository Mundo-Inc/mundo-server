import express from "express";

import {
  createMedia,
  getMedia,
  getMediaValidation,
} from "../controllers/MediaController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();

router
  .route("/")
  .get(authMiddleware, getMediaValidation, getMedia)
  .post(authMiddleware, createMedia);

export default router;
