import express from "express";

import {
  createEvent,
  createEventValidation,
  getEvent,
  getEventValidation,
  getEvents,
  getEventsValidation,
} from "../controllers/EventController";
import { authMiddleware } from "../middlewares/authMiddleWare";

const router = express.Router();
router.use(express.json());
router.use(authMiddleware);

router
  .route("/")
  .get(getEventsValidation, getEvents)
  .post(createEventValidation, createEvent);

router.route("/:id").get(getEventValidation, getEvent);

export default router;
