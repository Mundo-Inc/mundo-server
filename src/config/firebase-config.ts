import admin from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import path from "path";

import logger from "../api/services/logger/index.js";
import { env } from "../env.js";

const pwd = process.cwd();

const keyPath = path.resolve(
  pwd,
  `keys/${env.FIREBASE_SERVICE_ACCOUNT_KEY_FILE_NAME}`
);

initializeApp({
  credential: admin.credential.cert(keyPath),
});

logger.info("Firebase admin initialized");
