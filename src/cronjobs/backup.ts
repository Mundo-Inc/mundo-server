import { PutObjectCommand } from "@aws-sdk/client-s3";
import { spawn } from "child_process";
import fs from "fs";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";

import logger from "../api/services/logger/index.js";
import { env } from "../env.js";
import { s3Client } from "../utilities/aws-s3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, "backup");

// Backup MongoDB every day at 12:00 AM
cron.schedule("0 0 * * *", backupMongoDB);

function backupMongoDB() {
  // Ensure the backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const now = new Date();
  const fileName = `${env.DB_NAME}_${now.toISOString()}.gz`;
  const filePath = path.join(BACKUP_DIR, fileName);

  const child = spawn("mongodump", [
    `--db="${env.DB_NAME}"`,
    `--archive="${filePath}"`,
    "--gzip",
  ]);

  child.stdout.on("data", (data: Buffer) => {
    logger.verbose(`MongoDB backup stdout: ${data.toString()}`);
  });

  child.stderr.on("data", (data: Buffer) => {
    logger.verbose(`MongoDB backup stderr: ${data.toString()}`);
  });

  child.on("error", (err) => {
    logger.error("Error happened creating child process for backup", err);
  });

  child.on("exit", (code, signal) => {
    if (code !== 0) {
      logger.error(`mongodump process exited with code ${code}`);
    } else if (signal) {
      logger.error(`mongodump process exited with signal ${signal}`);
    } else {
      logger.verbose("Backup success");
      uploadBackupToS3(fileName, filePath).catch((err) =>
        logger.error("Error in backup upload:", err),
      );
    }
  });
}

async function uploadBackupToS3(fileName: string, filePath: string) {
  const fileStream = fs.createReadStream(filePath);

  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET_NAME_BACKUP,
    Key: fileName,
    Body: fileStream,
  });

  logger.verbose("Uploading backup file to S3...");

  await s3Client.send(command);
  logger.verbose("Backup uploaded successfully. Deleting local file...");

  fs.unlinkSync(filePath);
  logger.verbose("Local backup file deleted successfully.");
}
