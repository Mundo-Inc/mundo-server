import express from "express";

import adminRouter from "./api/v1/adminRouter";
import authRouter from "./api/v1/authRouter";
import checkinRouter from "./api/v1/checkinRouter";
import commentRouter from "./api/v1/commentRouter";
import devRouter from "./api/v1/devRouter";
import feedRouter from "./api/v1/feedRouter";
import generalRouter from "./api/v1/generalRouter";
import listRouter from "./api/v1/listRouter";
import mailRouter from "./api/v1/mailRouter";
import mapRouter from "./api/v1/mapRouter";
import mediaRouter from "./api/v1/mediaRouter";
import notificationRouter from "./api/v1/notificationRouter";
import placeRouter from "./api/v1/placeRouter";
import reactionRouter from "./api/v1/reactionRouter";
import reviewRouter from "./api/v1/reviewRouter";
import homemadeRouter from "./api/v1/homemadeRouter";
import rewardRouter from "./api/v1/rewardRouter";
import uploadRouter from "./api/v1/uploadRouter";
import userRouter from "./api/v1/userRouter";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/media", mediaRouter);
router.use("/upload", uploadRouter);
router.use("/users", userRouter);
router.use("/places", placeRouter);
router.use("/reviews", reviewRouter);
router.use("/homemades", homemadeRouter);
router.use("/reactions", reactionRouter);
router.use("/general", generalRouter);
router.use("/mail", mailRouter);
router.use("/checkins", checkinRouter);
router.use("/comments", commentRouter);
router.use("/map", mapRouter);
router.use("/feeds", feedRouter);
router.use("/notifications", notificationRouter);
router.use("/lists", listRouter);
router.use("/rewards", rewardRouter);
router.use("/dev", devRouter);
router.use("/admin", adminRouter);

export default router;
