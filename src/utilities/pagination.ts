import type { Request } from "express";

type PaginationOptions = {
  defaultLimit: number;
  maxLimit: number;
};

export function getPaginationFromQuery(
  req: Request,
  options: PaginationOptions
) {
  let page = parseInt(req.query.page as string, 10) || 1;
  let limit = parseInt(req.query.limit as string, 10) || options.defaultLimit;

  page = !Number.isInteger(page) || page < 1 ? 1 : page;
  limit = !Number.isInteger(limit) || limit < 1 ? options.defaultLimit : limit;

  if (limit > options.maxLimit) {
    limit = options.maxLimit;
  }

  const skip = (page - 1) * limit;

  return { page, limit, skip };
}
