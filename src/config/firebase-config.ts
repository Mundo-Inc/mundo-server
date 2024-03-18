import admin from "firebase-admin";
import path from "path";
import logger from "../api/services/logger";

const pwd = process.cwd();

const keyPath = path.resolve(
  pwd,
  `keys/${process.env.FIREBASE_SERVICE_ACCOUNT_KEY_FILE_NAME}`
);

admin.initializeApp({
  credential: admin.credential.cert(keyPath),
});

logger.info("Firebase admin initialized");
