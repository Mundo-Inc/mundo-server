import mongoose from "mongoose";
import { config } from ".";

export async function connectDatabase() {
  try {
    await mongoose.connect(`${config.DB_URI}/${config.DB_NAME}`);
    console.log("Connected to database");
  } catch (error) {
    console.log("Failed to connect to database", error);
    process.exit(1);
  }
}
