import express from "express";

import { devTests, fixPlaces, engagements } from "../controllers/DevController";
import { adminAuthMiddleware } from "../middlewares/authMiddleWare";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

router.route("/fixPlaces").get(fixPlaces);

router.route("/engagements").get(engagements);

router.route("/:action").get(devTests);


export default router;
