import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { NextFunction, Request, Response } from "express";
import type { File } from "formidable";
import * as fs from "fs";
import { readFileSync } from "fs";
import { StatusCodes } from "http-status-codes";
import path from "path";

import Upload, { type UploadUsecase } from "../../models/Upload.js";
import User from "../../models/User.js";
import strings from "../../strings.js";
import S3Manager from "../../utilities/S3Manager/index.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import {
  createThumbnail,
  generateFilename,
  parseForm,
  resizeVideo,
} from "../../utilities/storage.js";

function generateFileKey(
  usecase: UploadUsecase,
  userId: string,
  mimeType: string
) {
  let key = "";
  let fileName: string;

  const ext = mimeType.split("/")[1];

  switch (usecase) {
    case "profileImage":
      fileName = `profile.${ext}`;
      key = `${userId}/${fileName}`;
      break;
    case "placeReview":
      fileName = generateFilename(ext);
      key = `${userId}/${S3Manager.getFileDir(mimeType)}/${fileName}`;
      break;
    case "checkin":
      fileName = generateFilename(ext);
      key = `${userId}/${S3Manager.getFileDir(mimeType)}/${fileName}`;
      break;
    default:
      fileName = generateFilename(ext);
      key = `${userId}/${usecase}/${fileName}`;
  }

  return { key, fileName };
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

    if (files.image && files.image[0]) {
      const { filepath, mimetype } = files.image[0];

      if (!mimetype || !mimetype.startsWith("image/")) {
        throw createError(strings.upload.invalidFile, StatusCodes.BAD_REQUEST);
      }

      const { key } = generateFileKey(
        usecase,
        authUser._id.toString(),
        mimetype
      );

      const url = await S3Manager.uploadImage(
        {
          mimetype: mimetype,
          path: filepath,
        },
        key
      );

      fs.unlinkSync(filepath);

      if (usecase === "profileImage") {
        await User.findByIdAndUpdate(authUser._id, {
          profileImage: url,
        });

        res.sendStatus(StatusCodes.NO_CONTENT);
      } else {
        const upload = await Upload.create({
          user: authUser._id,
          key,
          src: url,
          usecase,
          type: mimetype.split("/")[0],
        });

        res.status(StatusCodes.CREATED).json({ success: true, data: upload });
      }
    } else if (files.video && files.video[0]) {
      const { filepath, mimetype } = files.video[0];

      if (!mimetype || !mimetype.startsWith("video/")) {
        throw createError(strings.upload.invalidFile, StatusCodes.BAD_REQUEST);
      }

      const { key, fileName } = generateFileKey(
        usecase,
        authUser._id.toString(),
        mimetype
      );

      const convertOutputPath = path.resolve(`./tmp/${fileName}`);

      if (convert) {
        const upload = await Upload.create({
          user: authUser._id,
          key,
          src: S3Manager.getURL(key),
          usecase,
          type: mimetype.split("/")[0],
        });

        res.status(StatusCodes.CREATED).json({ success: true, data: upload });

        await resizeVideo(filepath, convertOutputPath);

        await S3Manager.uploadVideo(
          {
            mimetype: mimetype,
            path: convertOutputPath,
          },
          key
        );
      } else {
        const url = await S3Manager.uploadVideo(
          {
            mimetype: mimetype,
            path: filepath,
          },
          key
        );

        const upload = await Upload.create({
          user: authUser._id,
          key,
          src: url,
          usecase,
          type: "video",
        });

        res.status(StatusCodes.CREATED).json({ success: true, data: upload });
      }

      await createThumbnail(filepath);
      const thumbnailOutputPath = path.resolve(
        `./tmp/${fileName.replace(/\.[^/.]+$/, "-thumbnail.jpg")}`
      );

      await S3Manager.uploadImage(
        {
          mimetype: S3Manager.AllowedMimeTypes.JPEG,
          path: thumbnailOutputPath,
        },
        key.replace(/\.[^/.]+$/, "-thumbnail.jpg")
      );

      fs.unlinkSync(thumbnailOutputPath);
      fs.unlinkSync(filepath);

      if (convert) {
        fs.unlinkSync(convertOutputPath);
      }
    } else {
      throw createError(strings.media.notProvided, StatusCodes.BAD_REQUEST);
    }
  } catch (err) {
    next(err);
  }
}
