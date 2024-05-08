import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import type { File } from "formidable";
import * as fs from "fs";
import { readFileSync } from "fs";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import path from "path";

import Event from "../../models/Event";
import Media, { MediaTypeEnum } from "../../models/Media";
import Place from "../../models/Place";
import strings, { dStrings, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import {
  bucketName,
  createThumbnail,
  parseForm,
  region,
  resizeVideo,
  s3,
} from "../../utilities/storage";
import type { CreateMediaDto } from "../dto/media/create-media.dto";
import UserProjection from "../dto/user/user";
import validate from "./validators";

const imagesDirectory = "images";
const videosDirectory = "videos";

export async function createMedia(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const { isConverted } = req.query;
    const { fields, files } = await parseForm(req);
    const { place, caption } = fields;

    if (files.image) {
      const { filepath, originalFilename, newFilename, size, mimetype } = files
        .image[0] as File;
      let fileBuffer = readFileSync(filepath);
      // if (!isConverted) {
      //   fileBuffer = await resizeImage(fileBuffer);
      // }
      const key = `${authUser._id.toString()}/${imagesDirectory}/${crypto
        .randomBytes(16)
        .toString("hex")}.jpg`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: fileBuffer,
          // ACL: "public-read",
          ContentType: "image/jpeg",
        })
      );
      const location = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
      const createMediaDto: CreateMediaDto = {
        src: location,
        caption: caption ? caption[0] : "",
        place: new mongoose.Types.ObjectId(place![0]),
        user: authUser._id,
        type: MediaTypeEnum.image,
      };
      const media = await Media.create(createMediaDto);

      fs.unlinkSync(filepath);
      res.status(StatusCodes.CREATED).json({ success: true, data: media });
    } else if (files.video) {
      const { filepath, originalFilename, newFilename, size, mimetype } = files
        .video[0] as File;
      const inputPath = filepath;
      const randomBytes = crypto.randomBytes(16).toString("hex");
      const tempFileName = `${randomBytes}.mp4`;
      const outputPath = `./tmp/${tempFileName}`;

      const key = `${authUser._id.toString()}/${videosDirectory}/${randomBytes}.mp4`;

      const location = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
      const createMediaDto: CreateMediaDto = {
        src: location,
        caption: caption ? caption[0] : "",
        place: new mongoose.Types.ObjectId(place![0]),
        user: authUser._id,
        type: MediaTypeEnum.video,
      };
      const media = await Media.create(createMediaDto);
      res.status(StatusCodes.CREATED).json({ success: true, data: media });

      if (!isConverted) {
        await resizeVideo(inputPath, outputPath);
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: fs.createReadStream(isConverted ? inputPath : outputPath),
          // ACL: "public-read",
          ContentType: "video/mp4",
        })
      );

      await createThumbnail(inputPath);
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
      fs.unlinkSync(path.resolve(inputPath));
      if (!isConverted) {
        fs.unlinkSync(path.resolve(outputPath));
      }
    } else {
      throw createError(strings.media.notProvided, StatusCodes.BAD_REQUEST);
    }
  } catch (err) {
    next(err);
  }
}

export const getMediaValidation: ValidationChain[] = [
  validate.page(query("page").optional()),
  validate.limit(query("limit").optional(), 5, 20),
  query("event")
    .if((_, { req }) => !req.query?.place)
    .isMongoId()
    .withMessage("Invalid event id"),
  query("place")
    .if((_, { req }) => !req.query?.event)
    .isMongoId()
    .withMessage("Invalid place id"),
];
export async function getMedia(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const { event, place } = req.query;

    if (place) {
      const exists = await Place.exists({ _id: place });
      if (!exists) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Place"),
          StatusCodes.NOT_FOUND
        );
      }
    }

    if (event) {
      const exists = await Event.exists({ _id: event });
      if (!exists) {
        throw createError(
          dynamicMessage(dStrings.notFound, "Event"),
          StatusCodes.NOT_FOUND
        );
      }
    }

    const medias = await Media.find({
      ...(event && { event: event }),
      ...(place && { place: place }),
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", UserProjection.essentials)
      .lean();

    res.status(StatusCodes.OK).json({ success: true, data: medias });
  } catch (err) {
    next(err);
  }
}
