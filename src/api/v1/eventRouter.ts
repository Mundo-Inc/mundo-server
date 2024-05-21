import express from "express";

import {
  createEvent,
  createEventValidation,
  getEvent,
  getEventValidation,
  getEvents,
  getEventsValidation,
} from "../controllers/EventController.js";
import { authMiddleware } from "../middlewares/authMiddleWare.js";

const router = express.Router();
router.use(express.json());

router
  .route("/")
  .get(getEventsValidation, getEvents)
  .post(authMiddleware, createEventValidation, createEvent);

router.route("/:id").get(getEventValidation, getEvent);

export default router;
