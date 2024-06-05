import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";

import logger from "../api/services/logger/index.js";
import { env } from "../env.js";
import { getFormattedDateTime } from "../utilities/stringHelper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ARCHIVE_PATH: string = path.join(
  __dirname,
  "backup",
  `${env.DB_NAME}_${getFormattedDateTime()}.gzip`
);

const s3Client: S3Client = new S3Client({
  region: env.AWS_REGION_BACKUP,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID_BACKUP,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY_BACKUP,
  },
});

// Backup MongoDB every day at 12:00 AM
// "*/5 * * * *"
cron.schedule("0 0 * * *", () => {
  backupMongoDB();
});

function backupMongoDB(): void {
  // Ensure the backup directory exists
  const backupDir = path.dirname(ARCHIVE_PATH);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true }); // Create the directory if it doesn't exist
  }
  const child: ChildProcessWithoutNullStreams = spawn("mongodump", [
    `--db=${env.DB_NAME}`,
    `--archive=${ARCHIVE_PATH}`,
    "--gzip",
  ]);
  child.stdout.on("data", (data: Buffer) => {});
  child.stderr.on("data", (data: Buffer) => {});
  child.on("error", (err: Error) => {
    logger.error("Error happened creating child process for backup", err);
  });
  child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    if (code) logger.verbose(`child process exited with code`, code);
    else if (signal) logger.verbose(`child process exited with signal`, signal);
    else {
      logger.info("Backup success ✔️");
      uploadBackupToS3().catch((err) =>
        logger.verbose("Error in backup upload:", err)
      );
    }
  });
}

async function uploadBackupToS3(): Promise<void> {
  const fileContent: Buffer = fs.readFileSync(ARCHIVE_PATH);
  // Setting up S3 upload parameters
  const now: Date = new Date();
  const fileName: string = `${env.DB_NAME}_${now.getFullYear()}-${
    now.getMonth() + 1
  }-${now.getDate()}_${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}.gzip`;

  const params = {
    Bucket: env.AWS_BUCKET_NAME_BACKUP,
    Key: fileName, // File name you want to save as in S3
    Body: fileContent,
  };

  logger.verbose("Uploading file to S3...", params);
  // Uploading files to the bucket
  try {
    await s3Client.send(new PutObjectCommand(params));
    logger.verbose("File uploaded successfully. Deleting local file...");
    fs.unlinkSync(ARCHIVE_PATH); // Delete the file after successful upload
    logger.verbose("Local file deleted successfully.");
  } catch (err) {
    logger.error("Error uploading backup", err);
  }
}
