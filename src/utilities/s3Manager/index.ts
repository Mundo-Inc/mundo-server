import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, type ReadStream } from "fs";
import { StatusCodes } from "http-status-codes";

import { env } from "../../env.js";
import { s3Client } from "../aws-s3.js";
import { createError } from "../errorHandlers.js";
import {
  validateFileSize,
  validateImageOptions,
  validateMimeType,
  validateVideoDuration,
  validateVideoOptions,
} from "./validators.js";

namespace S3Manager {
  const imagesDir = "images";
  const videosDir = "videos";

  export enum AllowedMimeTypes {
    JPEG = "image/jpeg",
    PNG = "image/png",
    WEBP = "image/webp",
    MP4 = "video/mp4",
    WEBM = "video/webm",
    MATROSKA = "video/x-matroska",
    MSVIDEO = "video/x-msvideo",
    H265 = "video/x-h265",
    QUICKTIME = "video/quicktime",
    X_QUICKTIME = "video/x-quicktime",
  }

  export const DEFAULT_IMAGE_MIME_TYPES = [
    AllowedMimeTypes.JPEG,
    AllowedMimeTypes.PNG,
    AllowedMimeTypes.WEBP,
  ];

  /**
   * Options for uploading images to S3.
   */
  export interface UploadImageOptions {
    sizeLimit?: {
      /**
       * The original file size in bytes.
       */
      fileSize: number;

      /**
       * The maximum allowed file size in MB.
       */
      fileSizeLimit: number;
    };
    allowedMimeTypes?: (
      | AllowedMimeTypes.JPEG
      | AllowedMimeTypes.PNG
      | AllowedMimeTypes.WEBP
    )[];
    cacheControl?: string;
  }

  type ImageFileObjectWithStream = {
    mimetype: string;
    stream: ReadStream;
  };
  type ImageFileObjectWithPath = {
    mimetype: string;
    path: string;
  };

  export async function uploadImage(
    file: ImageFileObjectWithStream,
    key: string,
    options?: UploadImageOptions,
  ): Promise<string>;
  export async function uploadImage(
    file: ImageFileObjectWithPath,
    key: string,
    options?: UploadImageOptions,
  ): Promise<string>;
  export async function uploadImage(
    file: ImageFileObjectWithStream | ImageFileObjectWithPath,
    key: string,
    options?: UploadImageOptions,
  ): Promise<string> {
    const { allowedMimeTypes, cacheControl } = validateImageOptions(options);

    if (!file.mimetype) {
      throw createError("File type not specified", StatusCodes.BAD_REQUEST);
    }

    if (options?.sizeLimit) {
      validateFileSize(
        options.sizeLimit.fileSize,
        options.sizeLimit.fileSizeLimit,
      );
    }

    validateMimeType(file.mimetype, allowedMimeTypes);

    let stream: ReadStream;
    if ("stream" in file) {
      stream = file.stream;
    } else {
      stream = createReadStream(file.path);
    }

    // Upload the file to S3
    const command = new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: stream,
      ContentType: file.mimetype,
      CacheControl: cacheControl,
    });

    await s3Client.send(command);

    return getURL(key);
  }

  // * Videos

  export const DEFAULT_VIDEO_MIME_TYPES = [
    AllowedMimeTypes.MP4,
    AllowedMimeTypes.WEBM,
    AllowedMimeTypes.MATROSKA,
    AllowedMimeTypes.MSVIDEO,
    AllowedMimeTypes.H265,
    AllowedMimeTypes.QUICKTIME,
    AllowedMimeTypes.X_QUICKTIME,
  ];

  /**
   * Options for uploading videos to S3.
   */
  export interface UploadVideoOptions {
    sizeLimit?: {
      /**
       * The original file size in bytes.
       */
      fileSize: number;

      /**
       * The maximum allowed file size in MB.
       */
      fileSizeLimit: number;
    };
    durationLimit?: {
      /**
       * The object URL of the video file.
       */
      url: string;

      /**
       * The maximum allowed duration in seconds.
       */
      maxDuration: number;
    };
    allowedMimeTypes?: (
      | AllowedMimeTypes.MP4
      | AllowedMimeTypes.WEBM
      | AllowedMimeTypes.MATROSKA
      | AllowedMimeTypes.MSVIDEO
      | AllowedMimeTypes.H265
      | AllowedMimeTypes.QUICKTIME
      | AllowedMimeTypes.X_QUICKTIME
    )[];
    cacheControl?: string;
  }

  type VideoFileObjectWithStream = {
    mimetype: string;
    stream: ReadStream;
  };
  type VideoFileObjectWithPath = {
    mimetype: string;
    path: string;
  };

  export async function uploadVideo(
    file: VideoFileObjectWithStream,
    key: string,
    options?: UploadVideoOptions,
  ): Promise<string>;
  export async function uploadVideo(
    file: VideoFileObjectWithPath,
    key: string,
    options?: UploadVideoOptions,
  ): Promise<string>;
  export async function uploadVideo(
    file: VideoFileObjectWithStream | VideoFileObjectWithPath,
    key: string,
    options?: UploadVideoOptions,
  ) {
    const { allowedMimeTypes, cacheControl } = validateVideoOptions(options);

    validateMimeType(file.mimetype, allowedMimeTypes);

    if (options?.sizeLimit) {
      validateFileSize(
        options.sizeLimit.fileSize,
        options.sizeLimit.fileSizeLimit,
      );
    }

    if (options?.durationLimit) {
      await validateVideoDuration(
        options.durationLimit.url,
        options.durationLimit.maxDuration,
      );
    }

    let stream: ReadStream;
    if ("stream" in file) {
      stream = file.stream;
    } else {
      stream = createReadStream(file.path);
    }

    // Upload the file to S3
    const command = new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: stream,
      ContentType: file.mimetype,
      CacheControl: cacheControl,
    });

    await s3Client.send(command);

    return getURL(key);
  }

  export async function deleteObject(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: env.AWS_S3_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  }

  export function getURL(key: string) {
    return `https://${env.AWS_S3_BUCKET_NAME}.s3.${env.AWS_S3_REGION}.amazonaws.com/${key}`;
  }

  export function getFileDir(mimetype: string) {
    const fileType = mimetype.split("/")[0];
    switch (fileType) {
      case "image":
        return imagesDir;
      case "video":
        return videosDir;
      default:
        return `${fileType}s`;
    }
  }
}

export default S3Manager;
