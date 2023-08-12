import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("GET /places");
});

export default router;
