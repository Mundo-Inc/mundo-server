import type { NextFunction, Request, Response } from "express";
import { ReasonPhrases, StatusCodes } from "http-status-codes";

import {
  ErrorResponse,
  ResponseStatusEnum,
  createResponse,
  type ErrorDetails,
} from "./response.js";
import logger from "../api/services/logger/index.js";

interface ErrorOptions {
  type: string;
  details?: {
    message: string;
  }[];
}

interface CustomError extends Error, ErrorOptions {
  statusCode: StatusCodes;
}

export function createError(
  message: string,
  options?:
    | (ErrorOptions & {
        statusCode: StatusCodes;
      })
    | StatusCodes
): CustomError {
  const error = new Error(message) as CustomError;

  if (typeof options === "number") {
    error.statusCode = options;
    error.type = "error";
  } else if (options) {
    Object.assign(error, options);
  }

  return error;
}

export function errorHandler(
  err: CustomError | Error,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction
) {
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;

  const body: ErrorDetails = {
    type: ReasonPhrases.INTERNAL_SERVER_ERROR,
    message: err.message,
  };

  if ("statusCode" in err && err.statusCode) {
    statusCode = err.statusCode;
  }

  if ("type" in err && err.type) {
    body.type = err.type;
  }

  if (statusCode === StatusCodes.INTERNAL_SERVER_ERROR) {
    logger.error("Internal Server Error", err);
  }

  res.status(statusCode).json(createResponse(ResponseStatusEnum.Error, body));

  return;
}
