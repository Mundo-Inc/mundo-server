import "dotenv/config";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import logger from "./api/services/logger/index.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./env.js";
import { errorHandler } from "./utilities/errorHandlers.js";

import "./config/firebase-config.js";

import router from "./router.js";

const app = express();

// Trust the first proxy in the chain
app.set("trust proxy", 1);

const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(rateLimiter);
app.use(helmet());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

async function main() {
  try {
    await connectDatabase();

    app.use("/api/v1", router);

    app.use(errorHandler);

    app.listen(env.APP_PORT, () => {
      logger.info(`Server listening on port ${env.APP_PORT}`);
    });

    await import("./cronjobs/updateTrendScores.js");
    await import("./cronjobs/bots.js");

    if (env.NODE_ENV === "production") {
      await import("./cronjobs/notification.js");
      await import("./cronjobs/backup.js");
    } else {
      logger.warn(
        "Not starting notification and backup cronjobs in development."
      );
    }
  } catch (error) {
    logger.error("Error starting server", error);
    process.exit(1);
  }
}

main();
