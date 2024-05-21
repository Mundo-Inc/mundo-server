import express from "express";

import { conversationsWebhook } from "../controllers/WebhookController.js";

const router = express.Router();
router.use(express.json());

router.post("/conversations", conversationsWebhook);

export default router;
