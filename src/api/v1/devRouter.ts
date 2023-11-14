import express from "express";

import { devTests, fixPlaces, engagements, importAllUsersToFirebase } from "../controllers/DevController";
import { adminAuthMiddleware } from "../middlewares/authMiddleWare";

// Admin Only
const router = express.Router();
router.use(express.json());
router.use(adminAuthMiddleware);

router.route("/fixPlaces").get(fixPlaces);

router.route("/engagements").get(engagements);

router.route("/:action").get(devTests);


router.route("/importAllUsersToFirebase").post(importAllUsersToFirebase)


export default router;
