import express from "express";

import { firebaseSync } from "../controllers/AuthController.js";

const router = express.Router();
router.use(express.json());

router.post("/firebaseSync", firebaseSync);

export default router;
