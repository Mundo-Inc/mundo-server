import express from "express";
import userRouter from "./api/v1/userRouter";
import placeRouter from "./api/v1/placeRouter";

const router = express.Router();

router.use("/users", userRouter);
router.use("/places", placeRouter);

export default router;
