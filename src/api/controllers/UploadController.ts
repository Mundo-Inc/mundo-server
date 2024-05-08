import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import type { File } from "formidable";
import * as fs from "fs";
import { readFileSync } from "fs";
import { StatusCodes } from "http-status-codes";
import path from "path";

import Upload, { type UploadUsecase } from "../../models/Upload";
import User from "../../models/User";
import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import {
  bucketName,
  createThumbnail,
  parseForm,
  region,
  resizeVideo,
  s3,
} from "../../utilities/storage";

const imagesDir = "images";
const videosDir = "videos";

function generateFileKey(
  usecase: UploadUsecase,
  userId: string,
  ext: "jpg" | "mp4"
) {
  let key = "";
  let name: string;
  switch (usecase) {
    case "profileImage":
      name = `profile.${ext}`;
      key = `${userId}/${name}`;
      break;
    case "placeReview":
      name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
      key = `${userId}/${ext === "jpg" ? imagesDir : videosDir}/${name}`;
      break;
    case "checkin":
      name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
      key = `${userId}/${ext === "jpg" ? imagesDir : videosDir}/${name}`;
      break;
    default:
      name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
      key = `${userId}/${usecase}/${name}`;
  }
  return { key, name };
}

export async function uploadFile(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { convert } = req.query;
    const { fields, files } = await parseForm(req);

    const usecase = fields.usecase![0] as UploadUsecase;

    if (files.image) {
      const { filepath, originalFilename, newFilename, size, mimetype } =
        files.image[0];

      if (!mimetype!.startsWith("image/")) {
        throw createError(strings.upload.invalidFile, StatusCodes.BAD_REQUEST);
      }

      let fileBuffer = readFileSync(filepath);

      const { key } = generateFileKey(usecase, authUser._id.toString(), "jpg");

      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: fileBuffer,
          // ACL: "public-read",
          ContentType: "image/jpeg",
        })
      );

      if (usecase === "profileImage") {
        await User.findByIdAndUpdate(authUser._id, {
          profileImage: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
        });
        res.status(StatusCodes.CREATED).json({
          success: true,
          data: {
            src: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
          },
        });
      } else {
        const upload = await Upload.create({
          user: authUser._id,
          key,
          src: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
          usecase,
          type: "image",
        });

        res.status(StatusCodes.CREATED).json({ success: true, data: upload });
      }
      fs.unlinkSync(filepath);
    } else if (files.video) {
      const { filepath, originalFilename, newFilename, size, mimetype } = files
        .video[0] as File;

      if (!mimetype!.startsWith("video/")) {
        throw createError(strings.upload.invalidFile, StatusCodes.BAD_REQUEST);
      }

      const { key, name: tempFileName } = generateFileKey(
        usecase,
        authUser._id.toString(),
        "mp4"
      );
      const outputPath = `./tmp/${tempFileName}`;

      if (convert) {
        const upload = await Upload.create({
          user: authUser._id,
          key,
          src: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
          usecase,
          type: "video",
        });

        res.status(StatusCodes.CREATED).json({ success: true, data: upload });

        await resizeVideo(filepath, outputPath);

        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: fs.createReadStream(outputPath),
            ContentType: "video/mp4",
          })
        );
      } else {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: fs.createReadStream(filepath),
            ContentType: "video/mp4",
          })
        );

        const upload = await Upload.create({
          user: authUser._id,
          key,
          src: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
          usecase,
          type: "video",
        });

        res.status(StatusCodes.CREATED).json({ success: true, data: upload });
      }

      await createThumbnail(filepath);
      const imageOutputPath = `./tmp/${newFilename.replace(
        /\.[^/.]+$/,
        "-thumbnail.jpg"
      )}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key.replace(/\.[^/.]+$/, "-thumbnail.jpg"),
          Body: fs.createReadStream(imageOutputPath),
          ContentType: "image/jpeg",
        })
      );

      fs.unlinkSync(path.resolve(imageOutputPath));
      fs.unlinkSync(path.resolve(filepath));
      if (convert) {
        fs.unlinkSync(path.resolve(outputPath));
      }
    } else {
      throw createError(strings.media.notProvided, StatusCodes.BAD_REQUEST);
    }
  } catch (err) {
    next(err);
  }
}
