import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
dotenv.config();

import { config } from "./config";
import { connectDatabase } from "./config/database";
import router from "./router";
import { errorHanlder } from "./utilities/errorHandlers";

const app: Express = express();

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100,
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

  // apple-app-site-association
  app.get("/apple-app-site-association", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.sendFile(process.cwd() + "/apple-app-site-association");
  });

  app.use(errorHanlder);

  app.listen(config.APP_PORT, () => {
    console.log(`Server listening on port ${config.APP_PORT}`);
  });

  if (process.env.NODE_ENV === "production") {
    await import("./cronjobs/notification");
  }
}

main();
