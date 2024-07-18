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

export const editCollaboratorAccessValidation = validateData({
  params: params,
  body: body,
});

export async function editCollaboratorAccess(
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

    if (!list.owner.equals(authUser._id)) {
      throw createError(
        "You're not the owner of this list",
        StatusCodes.FORBIDDEN
      );
    }

    const collaboratorIndex = list.collaborators.findIndex((c) =>
      c.user.equals(userId)
    );

    if (collaboratorIndex === -1) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    // Edit the access of the collaborator
    list.collaborators[collaboratorIndex].access = access;

    await list.save();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
