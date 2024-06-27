import { StatusCodes } from "http-status-codes";

import { createError } from "../errorHandlers.js";
import S3Manager from "./index.js";

export function validateFileSize(size: number, maxSizeInMB?: number) {
  if (maxSizeInMB && size > maxSizeInMB * 1024 * 1024) {
    throw createError(
      `File size exceeds the allowed limit of ${maxSizeInMB} MB.`,
      StatusCodes.BAD_REQUEST
    );
  }
}

export function validateMimeType(
  type: string,
  allowedMimeTypes: S3Manager.AllowedMimeTypes[]
) {
  if (!allowedMimeTypes.includes(type as S3Manager.AllowedMimeTypes)) {
    throw createError(
      `File type '${type}' not allowed. Allowed types: ${allowedMimeTypes.join(
        ", "
      )}`,
      StatusCodes.BAD_REQUEST
    );
  }
}

export function validateImageOptions(
  options: S3Manager.UploadImageOptions | undefined
) {
  return {
    allowedMimeTypes:
      options?.allowedMimeTypes || S3Manager.DEFAULT_IMAGE_MIME_TYPES,
    cacheControl: options?.cacheControl || "public, max-age=31536000",
  };
}

export function validateVideoOptions(
  options: S3Manager.UploadVideoOptions | undefined
) {
  return {
    allowedMimeTypes:
      options?.allowedMimeTypes || S3Manager.DEFAULT_VIDEO_MIME_TYPES,
    cacheControl: options?.cacheControl || "public, max-age=31536000",
  };
}

/**
 * Validates the duration of a video file against a specified maximum duration.
 *
 * @param file The video file to be validated.
 * @param maxDurationInSeconds The maximum allowed duration in seconds.
 * @returns Promise that resolves to true if the duration is valid, or throws an error if not.
 */
export async function validateVideoDuration(
  objectUrl: string,
  maxDurationInSeconds: number
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.src = objectUrl;

    video.onloadedmetadata = () => {
      // Release the object URL
      URL.revokeObjectURL(objectUrl);

      const duration = video.duration;
      if (duration > maxDurationInSeconds) {
        reject(
          createError(
            `Video duration exceeds the allowed limit of ${maxDurationInSeconds} seconds. Actual duration: ${duration} seconds.`,
            StatusCodes.BAD_REQUEST
          )
        );
      } else {
        resolve(true);
      }
    };

    // Error handling if the video metadata fails to load
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load video metadata."));
    };
  });
}
