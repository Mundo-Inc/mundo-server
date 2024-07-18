import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import List, { AccessEnum } from "@/models/List.js";
import { dStrings as ds, dynamicMessage } from "@/strings.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  listId: zObjectId,
  userId: zObjectId,
});
const body = z.object({
  access: z.nativeEnum(AccessEnum).optional().default(AccessEnum.Edit),
});

type Params = z.infer<typeof params>;
type Body = z.infer<typeof body>;

export const addCollaboratorValidation = validateData({
  params: params,
  body: body,
});

export async function addCollaborator(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { listId, userId } = req.params as unknown as Params;
    const { access } = req.body as Body;

    const list = await List.findById(listId).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND)
    );

    if (!authUser._id.equals(list.owner)) {
      throw createError(
        "You're not the owner of this list",
        StatusCodes.FORBIDDEN
      );
    }

    if (list.collaborators.some((c) => c.user.equals(userId))) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "User"),
        StatusCodes.CONFLICT
      );
    }

    list.collaborators.push({
      user: userId,
      access: access,
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
