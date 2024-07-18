import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import List, { AccessEnum } from "@/models/List.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  listId: zObjectId,
  placeId: zObjectId,
});

type Params = z.infer<typeof params>;

export const addToListValidation = validateData({
  params: params,
});

export async function addToList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { listId, placeId } = req.params as unknown as Params;

    const list = await List.findById(listId).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND)
    );

    const isCollaborator = list.collaborators.some(
      (c) => c.user.equals(authUser._id) && c.access === AccessEnum.Edit
    );

    if (!isCollaborator) {
      throw createError(
        "You're not a collaborator of this list",
        StatusCodes.FORBIDDEN
      );
    }

    if (list.places.some((p) => p.place.equals(placeId))) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "Place"),
        StatusCodes.CONFLICT
      );
    }

    list.places.push({
      place: placeId,
      user: authUser._id,
      createdAt: new Date(),
    });

    await list.save();

    res.status(StatusCodes.OK).json({
      success: true,
      data: list,
    });
  } catch (err) {
    next(err);
  }
}
