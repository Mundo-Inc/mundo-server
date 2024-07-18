import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import UserProjection from "@/api/dto/user.js";
import List from "@/models/List.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const getUserListsValidation = validateData({
  params: params,
});

export async function getUserLists(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const lists = await List.aggregate([
      {
        $match: {
          "collaborators.user": id,
          $or: [
            { isPrivate: false },
            {
              "collaborators.user": authUser._id,
              isPrivate: true,
            },
          ],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            {
              $project: UserProjection.essentials,
            },
          ],
        },
      },
      {
        $unwind: "$owner",
      },
      {
        $project: {
          _id: true,
          name: true,
          owner: true,
          icon: true,
          collaboratorsCount: { $size: "$collaborators" },
          placesCount: { $size: "$places" },
          isPrivate: true,
          createdAt: true,
        },
      },
    ]);

    res.json({ success: true, data: lists });
  } catch (error) {
    next(error);
  }
}
