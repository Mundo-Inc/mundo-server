import mongoose from "mongoose";
import { config } from ".";
import logger from "../api/services/logger";

export async function connectDatabase() {
  try {
    await mongoose.connect(`${config.DB_URI}/${config.DB_NAME}`);
    logger.info("Connected to database");
  } catch (error) {
    logger.error("Failed to connect to database", error);
    process.exit(1);
  }
}
