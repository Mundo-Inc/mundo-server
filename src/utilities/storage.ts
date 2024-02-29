import { S3 } from "@aws-sdk/client-s3";
import { path } from "@ffmpeg-installer/ffmpeg";
import { type Request } from "express";
import ffmpeg from "fluent-ffmpeg";
import formidable, { type Fields, type Files } from "formidable";
import * as fs from "fs";

ffmpeg.setFfmpegPath(path);

export const s3 = new S3({
  region: process.env.AWS_S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY as string,
  },
});

export const bucketName = process.env.AWS_S3_BUCKET_NAME;
export const region = process.env.AWS_S3_REGION;

export const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/x-matroska",
  "video/x-msvideo",
  "video/mp4",
  "video/x-h265",
  "video/quicktime",
  "video/x-quicktime",
];

export async function parseForm(
  req: Request
): Promise<{ fields: Fields; files: Files }> {
  const uploadDir = `./tmp`;

  // Ensure the upload directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const form = formidable({
    uploadDir,
    keepExtensions: true,
  });
  const [fields, files] = await form.parse(req);
  return { fields, files };
}

export const resizeVideo = (inputPath: string, outputPath: string) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, function (err, metadata) {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(
        (stream) => stream.codec_type === "video"
      );
      if (!videoStream) {
        reject(new Error("No video stream found"));
        return;
      }
      if (videoStream.height! > 1080) {
        ffmpeg(inputPath)
          .format("mp4")
          .outputOptions("-vf", "scale=-1:1080")
          .on("error", (err: any) => {
            reject(new Error("Error resizing video: " + err.message));
          })
          .on("end", () => {
            resolve(true);
          })
          .save(outputPath);
      } else {
        ffmpeg(inputPath)
          .format("mp4")
          .on("error", (err: any) => {
            reject(new Error("Error resizing video: " + err.message));
          })
          .on("end", () => {
            resolve(true);
          })
          .save(outputPath);
      }
    });
  });
};

export function createThumbnail(inputPath: string) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .on("error", (err: any) => {
        reject(new Error("Error creating thumbnail: " + err.message));
      })
      .on("end", (e) => {
        resolve(true);
      })
      .screenshots({
        timestamps: ["50%"],
        filename: "%b-thumbnail.jpg",
        folder: "./tmp/",
        size: "640x?",
      });
  });
}
