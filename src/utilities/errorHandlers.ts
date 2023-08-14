import type { NextFunction, Request, Response } from "express";
import { type ValidationError, validationResult } from "express-validator";

interface ErrorOptions {
  statusCode?: number;
  validation?: ValidationError[];
  data?: any;
}

interface CustomError extends Error {
  statusCode?: number;
  validation?: ValidationError[];
  data?: any;
}

export function errorHanlder(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const body: {
    message?: string;
    validation?: ValidationError[];
    data?: any;
  } = {};
  if (err.message) body.message = err.message;
  if (err.validation) {
    body.validation = err.validation;
  }
  if (err.data) body.data = err.data;

  return res
    .status(err.statusCode || 500)
    .json({ success: false, error: body });
}

export function createError(
  message: string,
  options?: ErrorOptions | number
): Error {
  let error: CustomError = new Error(message);
  if (options) {
    if (typeof options === "number") {
      error.statusCode = options;
    } else {
      for (const key in options) {
        error[key as keyof ErrorOptions] = options[key as keyof ErrorOptions];
      }
    }
  }
  return error;
}

export function handleInputErrors(req: Request) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw createError("Validation failed", {
      statusCode: 400,
      validation: errors.array(),
    });
  }
}
