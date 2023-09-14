import express from "express";

import {
  adminAuthMiddleware,
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/authMiddleWare";
import { devTests, fixPlaces } from "../controllers/DevController";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

router.route("/fixPlaces").get(fixPlaces);

router.route("/:action").get(devTests);


export default router;
