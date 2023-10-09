import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import List, { AccessEnum, IList } from "../../models/List";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";

export const createListValidation: ValidationChain[] = [
  body("name").isString(),
  body("owner").optional().isMongoId(),
  body("collaborators").optional().isArray(),
  body("icon").optional().isString(),
  body("isPrivate").optional().isBoolean(),
];

export async function createList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const {
      name,
      owner = authId,
      collaborators = [],
      icon,
      isPrivate = false,
    } = req.body;

    const newList: IList = new List({
      name,
      owner,
      collaborators,
      icon,
      isPrivate,
    });

    await newList.save();
    res.status(StatusCodes.CREATED).json({ list: newList }); // Send the ID of the created list as response
  } catch (err) {
    next(err);
  }
}

export const deleteListValidation: ValidationChain[] = [
  param("id").isMongoId(),
];

export async function deleteList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id: authId } = req.user!;
    const { id } = req.params;

    const list = await List.findById(id);

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    // Check if the reaction belongs to the authenticated user
    if (list.owner.toString() !== authId) {
      throw createError(strings.authorization.userOnly, StatusCodes.FORBIDDEN);
    }

    const deletedList = await List.deleteOne({
      _id: id,
      owner: authId,
    });

    if (deletedList.deletedCount === 0) {
      throw createError(
        strings.general.deleteFailed,
        StatusCodes.INTERNAL_SERVER_ERROR
      );
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const addToListValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("placeId").isMongoId(),
];

export async function addToList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id } = req.params;
    const { placeId } = req.body;
    const { id: authId } = req.user!;
    const list = (await List.findById(id)) as IList;
    if (!list) return res.status(StatusCodes.NOT_FOUND).json({ id: id });
    // checking user's access level
    if (!list.collaborators || list.collaborators.length === 0) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "The list has no collaborator!",
      });
    }

    const collaborator = list.collaborators.find(
      (c) => c.user.equals(authId) && c.access === AccessEnum.edit
    );

    if (!collaborator) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "You don't have edit permissions on this list.",
      });
    }

    if (list.places?.find((p) => p.place.toString() === placeId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Place already exists" });
    }

    if (list.places)
      list.places.push({
        place: placeId as any,
        user: authId as any,
      });

    await list.save();
    return res.status(200).json({ list });
  } catch (err) {
    next(err);
  }
}

export const removeFromListValidation: ValidationChain[] = [
  param("id").isMongoId(),
  param("placeId").isMongoId(),
];

export async function removeFromList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id, placeId } = req.params;
    const { id: authId } = req.user!;
    const list = (await List.findById(id)) as IList;
    if (!list) return res.status(StatusCodes.NOT_FOUND).json({ id: id });
    // checking user's access level
    if (!list.collaborators || list.collaborators.length === 0) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "The list has no collaborator!",
      });
    }

    const collaborator = list.collaborators.find(
      (c) => c.user.equals(authId) && c.access === AccessEnum.edit
    );

    if (!collaborator) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "You don't have edit permissions on this list.",
      });
    }

    if (!list.places?.find((p) => p.place.toString() === placeId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Place not exists in the list" });
    }

    if (list.places)
      list.places = list.places.filter((place) => {
        return place.place.toString() !== placeId;
      });

    await list.save();
    return res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const addCollaboratorValidation: ValidationChain[] = [
  param("id").isMongoId(), //list id
  body("userId").isMongoId(),
  body("access").optional().isIn(Object.values(AccessEnum)),
];

export async function addCollaborator(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id } = req.params;
    const { id: authId } = req.user!;
    const { userId, access } = req.body;

    const list = (await List.findById(id)) as IList;
    if (!list) return res.status(StatusCodes.NOT_FOUND).json({ id: id });

    if (!list.collaborators || list.collaborators.length === 0) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "The list has no collaborator!",
      });
    }

    if (list.owner.toString() !== authId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error:
          "You don't have edit permissions to add collaborators on this list.",
      });
    }

    if (list.collaborators?.find((c) => c.user.toString() === userId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "User is already exist in the collaborators" });
    }

    list.collaborators.push({
      user: userId as any,
      access: access as any,
    });

    await list.save();
    return res.status(200).json({ list });
  } catch (err) {
    next(err);
  }
}

export const removeFromCollaboratorsValidation: ValidationChain[] = [
  param("id").isMongoId(),
  param("userId").isMongoId(),
];

export async function removeFromCollaborators(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id, userId } = req.params;
    const { id: authId } = req.user!;
    const list = (await List.findById(id)) as IList;
    if (!list) return res.status(StatusCodes.NOT_FOUND).json({ id: id });
    // checking user's access level
    if (!list.collaborators || list.collaborators.length === 0) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error: "The list has no collaborator!",
      });
    }

    if (list.owner.toString() !== authId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        error:
          "You don't have edit permissions to add collaborators on this list.",
      });
    }

    if (!list.collaborators?.find((c) => c.user.toString() === userId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "User does not exist in the list" });
    }

    if (list.collaborators)
      list.collaborators = list.collaborators.filter((collaborator) => {
        return collaborator.user.toString() !== userId;
      });

    await list.save();
    return res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

//TODO: edit list

//TODO: edit collaborator access
