import type { NextFunction, Request, Response } from "express";
import { validationResult, type ValidationError } from "express-validator";
import { StatusCodes } from "http-status-codes";

import logger from "../api/services/logger/index.js";

interface ErrorOptions {
  statusCode?: number;
  validation?: ValidationError[];
  title?: string;
}

interface CustomError extends Error {
  statusCode?: number;
  validation?: ValidationError[];
  title?: string;
}

export function errorHandler(
  err: CustomError | Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  const body: {
    message: string;
    title?: string;
    validation?: ValidationError[];
  } = {
    message: "Something went wrong. Please try again later.",
  };

  if ("statusCode" in err && err.statusCode) {
    statusCode = err.statusCode;
    body.message = err.message;
  }

  if ("validation" in err && err.validation) {
    body.validation = err.validation;
  }

  if ("title" in err && err.title) {
    body.title = err.title;
  }

  if (statusCode === StatusCodes.INTERNAL_SERVER_ERROR) {
    logger.error("Internal Server Error", err);
  } else {
    logger.verbose("Response Error", err);
  }

  return res.status(statusCode).json({ success: false, error: body });
}

export function createError(
  message: string,
  options?: ErrorOptions | number
): Error {
  const error: CustomError = new Error(message);
  if (typeof options === "number") {
    error.statusCode = options;
  } else if (options) {
    Object.assign(error, options);
  }
  return error;
}

export function handleInputErrors(req: Request) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Formatting the error messages for better readability
    const filteredErrors = errors.array().filter((err) => {
      if ("path" in err) {
        return !err.path.includes("password");
      }
      return true; // If there's no 'path', include the error
    });

    const formattedErrors = filteredErrors
      .map((err) => {
        if ("param" in err && "msg" in err) {
          return `${err.param}: ${err.msg}`;
        } else {
          // Pretty print the error object
          return `Validation error: ${JSON.stringify(err, null, 2)}`;
        }
      })
      .join("\n");

    logger.verbose(
      `Failed to validate inputs on ${req.path}:\n${formattedErrors}`,
      {
        route: req.path,
        method: req.method,
        errors: errors.array(),
      }
    );

    throw createError("Validation failed", {
      statusCode: StatusCodes.BAD_REQUEST,
      validation: errors.array(),
    });
  }
}
