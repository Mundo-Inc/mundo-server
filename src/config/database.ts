import mongoose from "mongoose";

import logger from "../api/services/logger/index.js";
import { env } from "../env.js";

export async function connectDatabase() {
  try {
    const connectionInstance = await mongoose.connect(
      `${env.DB_URI}/${env.DB_NAME}`,
    );
    logger.verbose(
      `MongoDB Connected. Db host: ${connectionInstance.connection.host}`,
    );
  } catch (error) {
    logger.error("MongoDB Connection error", error);
    process.exit(1);
  }
}
