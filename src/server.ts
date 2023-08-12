import dotenv from "dotenv";
import express, { Express, Request, Response } from "express";
import helmet from "helmet";
dotenv.config();
import {
  ReasonPhrases,
  StatusCodes,
  getReasonPhrase,
  getStatusCode,
} from "http-status-codes";
import rateLimit from "express-rate-limit";
import cors from "cors";

import { config } from "./config";
import { connectDatabase } from "./config/database";
import router from "./router";

const app: Express = express();

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
  message: "Too many requests.",
});

app.use(cors());
app.use(limiter);
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function main() {
  await connectDatabase();

  app.use("/api/v1", router);

  app.listen(config.APP_PORT, () => {
    console.log(`Server listening on port ${config.APP_PORT}`);
  });
}

main();
