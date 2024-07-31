import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { randomBytes } from "crypto";
import type { Request } from "express";
import ffmpeg from "fluent-ffmpeg";
import formidable, { type Fields, type Files } from "formidable";
import * as fs from "fs";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath);

export async function parseForm(
  req: Request,
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
        (stream) => stream.codec_type === "video",
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

export function createThumbnail(inputPath: string, outputName: string) {
  return new Promise<string>((resolve, reject) => {
    ffmpeg(inputPath)
      .on("error", (err) => {
        reject(
          new Error(
            `Error creating thumbnail for ${inputPath}: ${err.message}`,
          ),
        );
      })
      .on("end", () => {
        resolve(path.resolve(`./tmp/${outputName}`));
      })
      .screenshots({
        timestamps: ["50%"],
        filename: outputName,
        folder: "./tmp/",
        size: "640x?",
      });
  });
}

export function generateFilename(extension: string): string {
  const date = new Date();
  const dateString = date.toISOString().split("T")[0].replace(/-/g, "");
  const randomString = randomBytes(8).toString("hex");

  return `${dateString}-${randomString}.${extension}`;
}
