import express from "express";

import {
  authCallback,
  authGet,
  authGetValidation,
  authPost,
  signinValidation,
} from "../controllers/AuthController";

const router = express.Router();
router.use(express.json());

router.get("/", authGetValidation, authGet);
router.post("/", signinValidation, authPost);
router.get("/social_callback", authCallback);

export default router;
