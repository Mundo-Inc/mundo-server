import express from "express";

import authRouter from "./api/v1/authRouter";
import checkinRouter from "./api/v1/checkinRouter";
import commentRouter from "./api/v1/commentRouter";
import generalRouter from "./api/v1/generalRouter";
import mailRouter from "./api/v1/mailRouter";
import mapRouter from "./api/v1/mapRouter";
import mediaRouter from "./api/v1/mediaRouter";
import uploadRouter from "./api/v1/uploadRouter";
import placeRouter from "./api/v1/placeRouter";
import reactionRouter from "./api/v1/reactionRouter";
import reviewRouter from "./api/v1/reviewRouter";
import userRouter from "./api/v1/userRouter";
import feedRouter from "./api/v1/feedRouter";
import notificationRouter from "./api/v1/notificationRouter";
import listRouter from "./api/v1/listRouter";
import devRouter from "./api/v1/devRouter";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/media", mediaRouter);
router.use("/upload", uploadRouter);
router.use("/users", userRouter);
router.use("/places", placeRouter);
router.use("/reviews", reviewRouter);
router.use("/reactions", reactionRouter);
router.use("/general", generalRouter);
router.use("/mail", mailRouter);
router.use("/checkins", checkinRouter);
router.use("/comments", commentRouter);
router.use("/map", mapRouter);
router.use("/feeds", feedRouter);
router.use("/notifications", notificationRouter);
router.use("/list", listRouter);
router.use("/dev", devRouter);

export default router;
