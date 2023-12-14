import express from "express";

import {
  authPost,
  firebaseSync,
  signinValidation,
} from "../controllers/AuthController";

const router = express.Router();
router.use(express.json());

router.post("/", signinValidation, authPost);
router.post("/firebaseSync", firebaseSync);

export default router;
