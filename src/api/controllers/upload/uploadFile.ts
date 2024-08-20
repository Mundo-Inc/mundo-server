import type { NextFunction, Request, Response } from "express";
import fs from "fs";
import { StatusCodes } from "http-status-codes";

import type { UploadUsecase } from "../../../models/upload.js";
import Upload from "../../../models/upload.js";
import User from "../../../models/user/user.js";
import strings from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import S3Manager from "../../../utilities/s3Manager/index.js";
import {
  createThumbnail,
  generateFilename,
  parseForm,
} from "../../../utilities/storage.js";

export async function uploadFile(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

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
        mimetype,
      );

      const url = await S3Manager.uploadImage(
        {
          mimetype: mimetype,
          path: filepath,
        },
        key,
      );

      fs.unlinkSync(filepath);

      if (usecase === "profileImage") {
        const timestamp = Math.floor(Date.now() / 1000).toString();

        await User.findByIdAndUpdate(authUser._id, {
          profileImage: url + `?t=${timestamp}`,
        });

        const upload = new Upload({
          user: authUser._id,
          key: key + `?t=${timestamp}`,
          src: url + `?t=${timestamp}`,
          usecase,
          type: mimetype.split("/")[0],
        });

        res.status(StatusCodes.CREATED).json(createResponse(upload));
      } else {
        const upload = await Upload.create({
          user: authUser._id,
          key,
          src: url,
          usecase,
          type: mimetype.split("/")[0],
        });

        res.status(StatusCodes.CREATED).json(createResponse(upload));
      }
    } else if (files.video && files.video[0]) {
      const { filepath, mimetype } = files.video[0];

      if (!mimetype || !mimetype.startsWith("video/")) {
        throw createError(strings.upload.invalidFile, StatusCodes.BAD_REQUEST);
      }

      const { key, fileName } = generateFileKey(
        usecase,
        authUser._id.toString(),
        mimetype,
      );

      const url = await S3Manager.uploadVideo(
        {
          mimetype: mimetype,
          path: filepath,
        },
        key,
      );

      const upload = await Upload.create({
        user: authUser._id,
        key,
        src: url,
        usecase,
        type: "video",
      });

      res.status(StatusCodes.CREATED).json(createResponse(upload));

      const thumbnailOutputPath = await createThumbnail(
        filepath,
        fileName.replace(/\.[^/.]+$/, "-thumbnail.jpg"),
      );

      await S3Manager.uploadImage(
        {
          mimetype: S3Manager.AllowedMimeTypes.JPEG,
          path: thumbnailOutputPath,
        },
        key.replace(/\.[^/.]+$/, "-thumbnail.jpg"),
      );

      fs.unlinkSync(thumbnailOutputPath);
      fs.unlinkSync(filepath);
    } else {
      throw createError(strings.media.notProvided, StatusCodes.BAD_REQUEST);
    }
  } catch (err) {
    next(err);
  }
}

function generateFileKey(
  usecase: UploadUsecase,
  userId: string,
  mimeType: string,
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
