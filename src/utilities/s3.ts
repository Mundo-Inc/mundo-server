import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { StatusCodes } from "http-status-codes";
import { v4 as uuidv4 } from "uuid";

import { env } from "../env.js";
import { createError } from "./errorHandlers.js";

const s3Client = new S3Client({
  credentials: {
    accessKeyId: env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_S3_SECRET_ACCESS_KEY,
  },
  region: env.AWS_S3_REGION,
});

const uploadToS3 = async (
  file: File,
  path: string,
  allowedExtensions: string[],
  maxSizeInMB: number,
  maxVideoLengthInSeconds: number
): Promise<string | null> => {
  // Check file size
  const fileSizeInMB = file.size / (1024 * 1024);
  if (fileSizeInMB > maxSizeInMB) {
    throw createError(
      "File size exceeds the allowed limit.",
      StatusCodes.BAD_REQUEST
    );
  }

  // Check file extension
  const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!allowedExtensions.includes(fileExtension)) {
    throw createError("File type not allowed.", StatusCodes.BAD_REQUEST);
  }

  // Check video length if it's a video file
  if (file.type.startsWith("video/")) {
    const videoDuration = await getVideoDuration(file);
    if (videoDuration > maxVideoLengthInSeconds) {
      throw createError(
        "Video length exceeds the allowed limit.",
        StatusCodes.BAD_REQUEST
      );
    }
  }

  // Upload the file to S3
  const key = `${path}/${uuidv4()}.${fileExtension}`;
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: file.type,
    ACL: "public-read",
  });

  await s3Client.send(command);
  return `https://${env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${key}`;
};

const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
  });
};

export { uploadToS3 };
