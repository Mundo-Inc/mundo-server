import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import UserProjection from "../../../api/dto/user.js";
import List from "../../../models/List.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  listId: zObjectId,
});
const body = z.object({
  name: z.string().optional(),
  icon: z.string().optional(),
  isPrivate: z.boolean().optional(),
});

type Params = z.infer<typeof params>;
type Body = z.infer<typeof body>;

export const editListValidation = validateData({
  params: params,
  body: body,
});

export async function editList(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { listId } = req.params as unknown as Params;
    const { name, icon, isPrivate } = req.body as Body;

    const list = await List.findById(listId).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND),
    );

    if (!authUser._id.equals(list.owner)) {
      throw createError(
        "You're not the owner of this list",
        StatusCodes.FORBIDDEN,
      );
    }

    // Update list with new values, if they are provided
    if (name !== undefined) {
      list.name = name;
    }
    if (icon !== undefined) {
      list.icon = icon;
    }
    if (isPrivate !== undefined) {
      list.isPrivate = isPrivate;
    }

    // Save the updated list
    await list.save();

    await list.populate("owner", UserProjection.essentials);

    return res.status(StatusCodes.OK).json(
      createResponse({
        _id: list._id,
        name: list.name,
        owner: list.owner,
        icon: list.icon,
        isPrivate: list.isPrivate,
        createdAt: list.createdAt,
        collaboratorsCount: list.collaborators.length,
        placesCount: list.places.length,
      }),
    );
  } catch (err) {
    next(err);
  }
}
