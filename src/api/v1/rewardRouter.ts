import express from "express";

import { cashOut } from "../controllers/reward/cashOut.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router.post("/cashout", cashOut);

export default router;
