import express from "express";

import {
  createHomemadePost,
  createHomemadePostValidation,
} from "../controllers/homemade/createHomemadePost.js";
import {
  getHomemadePost,
  getHomemadePostValidation,
} from "../controllers/homemade/getHomemadePost.js";
import {
  getHomemadePosts,
  getHomemadePostsValidation,
} from "../controllers/homemade/getHomemadePosts.js";
import {
  removeHomemadePost,
  removeHomemadePostValidation,
} from "../controllers/homemade/removeHomemadePost.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(authMiddleware, getHomemadePostsValidation, getHomemadePosts)
  .post(authMiddleware, createHomemadePostValidation, createHomemadePost);

router
  .route("/:id")
  .get(authMiddleware, getHomemadePostValidation, getHomemadePost)
  .delete(authMiddleware, removeHomemadePostValidation, removeHomemadePost);

export default router;
