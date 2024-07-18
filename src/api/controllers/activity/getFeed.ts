import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { getUserFeed } from "@/api/services/feed.service.js";
import { getConnectionStatuses } from "@/utilities/connections.js";
import { getPaginationFromQuery } from "@/utilities/pagination.js";
import { validateData, zPaginationSpread } from "@/utilities/validation.js";

const query = z.object({
  ...zPaginationSpread,
  isForYou: z
    .string()
    .transform((value) => value === "true")
    .optional()
    .default("false"),
});

type Query = z.infer<typeof query>;

export const getFeedValidation = validateData({
  query: query,
});

export async function getFeed(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = req.user!;

    const { limit, skip } = getPaginationFromQuery(req, {
      defaultLimit: 30,
      maxLimit: 50,
    });

    const { isForYou } = req.query as unknown as Query;

    const result = await getUserFeed(authUser._id, isForYou, limit, skip);

    // Get follow status for each user
    const usersIdSet = new Set<string>();

    result.forEach((activity) => {
      const userId = activity.user._id.toString();
      if (!authUser._id.equals(userId)) {
        usersIdSet.add(userId);
      }

      if (activity.resourceType === "User") {
        const resourceId = activity.resource._id.toString();
        if (!authUser._id.equals(resourceId)) {
          usersIdSet.add(resourceId);
        }
      }
    });

    const usersObject = await getConnectionStatuses(
      authUser._id,
      Array.from(usersIdSet)
    );

    result.forEach((activity) => {
      activity.user.connectionStatus =
        usersObject[activity.user._id.toString()];

      if (activity.resourceType === "User") {
        const resourceId = activity.resource._id.toString();
        activity.resource.connectionStatus = usersObject[resourceId];
      }

      // TODO: remove on next release
      activity.privacyType = "PUBLIC";
    });

    res.status(StatusCodes.OK).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
