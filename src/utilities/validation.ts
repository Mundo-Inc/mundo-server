import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import type { ZodObject, ZodRawShape } from "zod";
import { ZodError, z } from "zod";

import { createError } from "./errorHandlers.js";

interface Schema {
  body?: ZodObject<ZodRawShape>;
  query?: ZodObject<ZodRawShape>;
  params?: ZodObject<ZodRawShape>;
}

export function validateData(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        const parsed = schema.body.parse(req.body);
        req.body = parsed;
      }
      if (schema.query) {
        const parsed = schema.query.parse(req.query);
        req.query = parsed;
      }
      if (schema.params) {
        const parsed = schema.params.parse(req.params);
        req.params = parsed;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));

        next(
          createError("Invalid data", {
            statusCode: StatusCodes.BAD_REQUEST,
            type: "validation",
            details: errorMessages,
          })
        );
      } else if (error instanceof Error) {
        next(
          createError(error.message, {
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            type: "validation",
          })
        );
      } else {
        next(
          createError("An unknown error occurred", {
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            type: "validation",
          })
        );
      }
    }
  };
}

export const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const zObjectIdOrMe = z
  .string()
  .regex(objectIdRegex)
  .or(z.literal("me"))
  .transform((arg) => {
    if (arg === "me") {
      return arg;
    } else {
      return new Types.ObjectId(arg);
    }
  });

export const zObjectId = z
  .string()
  .regex(objectIdRegex)
  .transform((arg) => new Types.ObjectId(arg));

export const zUniqueObjectIdArray = z
  .array(z.string().regex(objectIdRegex))
  .transform((args) =>
    Array.from(new Set(args)).map((id) => new Types.ObjectId(id))
  );

export const zPhone = z.string().regex(/^\+[1-9]\d{1,14}$/);

export const zUsername = z
  .string()
  .trim()
  .min(5)
  .max(20)
  .regex(/^[a-zA-Z0-9_]*$/);

export const zPassword = z.string().min(6).max(100);

export const zPaginationSpread = {
  page: z.string().optional(),
  limit: z.string().optional(),
};

export const zGeoValidation = {
  string: {
    lat: z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .transform((value) => parseFloat(value))
      .refine((value) => value >= -90 && value <= 90, {
        message: "Latitude must be between -90 and 90",
      }),

    lng: z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .transform((value) => parseFloat(value))
      .refine((value) => value >= -180 && value <= 180, {
        message: "Longitude must be between -180 and 180",
      }),
  },

  lat: z.number().min(-90).max(90),

  lng: z.number().min(-180).max(180),
};

export const zStringInt = z
  .string()
  .regex(/^-?\d+$/)
  .transform((value) => parseInt(value));

export const zStringFloat = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform((value) => parseFloat(value));
