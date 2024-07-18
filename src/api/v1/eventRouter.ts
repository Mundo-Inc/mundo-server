import express from "express";

import {
  createEvent,
  createEventValidation,
} from "../controllers/event/createEvent.js";
import { getEvent, getEventValidation } from "../controllers/event/getEvent.js";
import {
  getEvents,
  getEventsValidation,
} from "../controllers/event/getEvents.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(getEventsValidation, getEvents)
  .post(authMiddleware, createEventValidation, createEvent);

router.route("/:id").get(getEventValidation, getEvent);

export default router;
