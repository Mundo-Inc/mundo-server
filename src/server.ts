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
import { loadCronJobs } from "./cronjobs/index.js";
import { env } from "./env.js";
import gracefulShutdown from "./gracefulShutdown.js";
import router from "./router.js";
import { createError, errorHandler } from "./utilities/errorHandlers.js";

import "./socket.js";

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

app.use(
  cors({
    origin: "*",
    credentials: true,
  }),
);
app.use(rateLimiter);
app.use(helmet());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

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

loadCronJobs(env.NODE_ENV);

server.listen(env.APP_PORT, () => {
  logger.verbose(
    `${env.NODE_ENV} mode | Server listening on port ${env.APP_PORT}`,
  );
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    logger.error(`Port ${env.APP_PORT} is already in use.`);
  } else if (error.code === "EACCES") {
    logger.error(`Insufficient privileges to bind to port ${env.APP_PORT}.`);
  } else {
    logger.error("Error starting server", error);
  }
  process.exit(1);
});

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
