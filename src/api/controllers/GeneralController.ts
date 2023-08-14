import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import Category from "../../models/Category";
import { handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";

export const getCategoriesValidation: ValidationChain[] = [
  validate.q(query("q").optional()),
];
export async function getCategories(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { q } = req.query;

    const query: {
      [key: string]: any;
    } = {
      isActive: true,
    };

    if (q) {
      query["$or"] = [
        { _id: { $regex: q as string, $options: "i" } },
        { title: { $regex: q as string, $options: "i" } },
      ];
    }

    const categories = await Category.find(query, {
      _id: 1,
      title: 1,
    }).limit(5);

    res.status(StatusCodes.OK).json(categories);
  } catch (err) {
    next(err);
  }
}
