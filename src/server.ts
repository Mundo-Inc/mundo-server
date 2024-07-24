import "dotenv/config";
import "./config/firebase-config.js";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { StatusCodes } from "http-status-codes";

import logger from "./api/services/logger/index.js";
import { app, server } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./env.js";
import router from "./router.js";
import { createError, errorHandler } from "./utilities/errorHandlers.js";

import { loadCronJobs } from "./cronjobs/index.js";
import "./socket.js";
import { io } from "./socket.js";

app.set("trust proxy", 1);

const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw createError(
      "Too many requests from this IP, please try again after a minute",
      {
        type: "Rate Limit Exceeded",
        statusCode: StatusCodes.TOO_MANY_REQUESTS,
      },
    );
  },
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

    app.use((req, res, next) => {
      next(
        createError("Route not found", {
          type: "Route Not Found",
          statusCode: StatusCodes.NOT_FOUND,
        }),
      );
    });

    app.use(errorHandler);

    server.listen(env.APP_PORT, () => {
      logger.verbose(`Server listening on port ${env.APP_PORT}`);
    });

    loadCronJobs(env.NODE_ENV);
  } catch (error) {
    logger.error("Error starting server", error);
    process.exit(1);
  }
}

const gracefulShutdown = () => {
  if (!shuttingDown) {
    shuttingDown = true;
    logger.info("Received shutdown signal, cleaning up...");

    const cleanupPromises = [
      new Promise((resolve) => {
        io.close(resolve);
      }),
    ];

    Promise.all(cleanupPromises)
      .then(() => {
        logger.info("Cleanup completed successfully.");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Failed during cleanup:", error);
        process.exit(1);
      });
  }
};

let shuttingDown = false;
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

main();
