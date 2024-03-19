import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import logger from "./api/services/logger";
import { config } from "./config";
import { connectDatabase } from "./config/database";
import { errorHandler } from "./utilities/errorHandlers";

import "./config/firebase-config";

import router from "./router";
import { updateGeoLocationsInUserActivities } from "./api/controllers/MapController";

const app = express();

app.set("trust proxy", 1); // If there's one proxy in front of your app

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: "Too many requests.",
});

app.use(cors());
app.use(limiter);
app.use(helmet());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

async function main() {
  await connectDatabase();

  app.use("/api/v1", router);

  app.use(errorHandler);

  app.listen(config.APP_PORT, () => {
    logger.info(`Server listening on port ${config.APP_PORT}`);
  });

  await import("./cronjobs/updateTrendScores");
  await import("./cronjobs/bots");

  //TODO: REMOVE AFTER FIRST USE
  await updateGeoLocationsInUserActivities();

  if (process.env.NODE_ENV === "production") {
    await import("./cronjobs/notification");
    await import("./cronjobs/backup");
  } else {
    logger.warn(
      "Not starting notification and backup cronjobs in development."
    );
  }
}

main();
