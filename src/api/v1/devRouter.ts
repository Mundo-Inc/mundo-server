import express from "express";

import {
  deviceTokens,
  engagements,
  fixPlaces,
  importAllUsersToFirebase,
} from "../controllers/DevController";
import { adminAuthMiddleware } from "../middlewares/authMiddleWare";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

// Routes
router.get("/fixPlaces", fixPlaces);

router.get("/engagements", engagements);

router.get("/deviceTokens", deviceTokens);

router.post("/importAllUsersToFirebase", importAllUsersToFirebase);

export default router;
