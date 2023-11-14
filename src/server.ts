import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

var admin = require("firebase-admin");

dotenv.config();


const serviceAccount = {
  "type": process.env.FIREBASE_TYPE,
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY,
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": process.env.FIREBASE_AUTH_URI,
  "token_uri": process.env.FIREBASE_TOKEN_URI,
  "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL,
  "universe_domain": process.env.FIREBASE_UNIVERSE_DOMAIN
}


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

import { config } from "./config";
import { connectDatabase } from "./config/database";
import router from "./router";
import { errorHanlder } from "./utilities/errorHandlers";

const app: Express = express();

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 150,
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

  await import("./cronjobs/updateTrendScores");

  if (process.env.NODE_ENV === "production") {
    await import("./cronjobs/notification");
  }
}

main();
