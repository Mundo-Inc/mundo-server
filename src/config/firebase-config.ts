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

const alternativeKeyPath = path.resolve(
  pwd,
  `keys/${env.FIREBASE_ALTERNATE_SERVICE_ACCOUNT_KEY_FILE_NAME}`
);

export const MundoApp = initializeApp(
  {
    credential: admin.credential.cert(keyPath),
  },
  "the-mundo"
);

export const PhPhApp = initializeApp(
  {
    credential: admin.credential.cert(alternativeKeyPath),
  },
  "phantom-phood"
);

logger.verbose("Firebase admin initialized");
