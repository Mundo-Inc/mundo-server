import mongoose from "mongoose";

import logger from "../api/services/logger/index.js";
import { env } from "../env.js";

export async function connectDatabase() {
  try {
    await mongoose.connect(`${env.DB_URI}/${env.DB_NAME}`);
    logger.info("Connected to database");
  } catch (error) {
    logger.error("Failed to connect to database", error);
    process.exit(1);
  }
}
