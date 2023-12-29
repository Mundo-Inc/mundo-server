import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import List, { AccessEnum, IList } from "../../models/List";
import Place from "../../models/Place";
import User from "../../models/User";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { getListOfListsDTO } from "../dto/list/readLists";
import { readPlaceBriefProjection } from "../dto/place/read-place-brief.dto";
import { readUserCompactProjection } from "../dto/user/read-user-compact-dto";

export const getListValidation: ValidationChain[] = [param("id").isMongoId()];

export async function getList(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const { id } = req.params;

    const list = await List.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
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
              $project: readUserCompactProjection,
            },
          ],
        },
      },
      {
        $unwind: "$owner",
      },
      {
        $addFields: {
          placesCount: {
            $size: "$places",
          },
        },
      },
    ]);

    let result = list[0];

    if (!result) {
      throw createError("List not found", 400);
    }

    // Authorization
    const isCollaborator = result.collaborators.find(
      (c: any) => c.user.toString() === authId
    );
    if (result.isPrivate && !isCollaborator) {
      throw createError("not authorized to view the list", 403);
    }

    for (let i = 0; i < result.collaborators.length; i++) {
      let user = await User.findById(
        result.collaborators[i].user,
        readUserCompactProjection
      ).lean();
      if (!user) {
        throw createError("User not found", 400);
      }
      result.collaborators[i].user = user;
    }
    for (let i = 0; i < result.places.length; i++) {
      let p = await Place.findById(
        result.places[i].place,
        readPlaceBriefProjection
      ).lean();
      let user = await User.findById(
        result.places[i].user,
        readUserCompactProjection
      ).lean();
      if (!p) {
        throw createError("Place not found", 400);
      }
      if (!user) {
        throw createError("User not found", 400);
      }
      result.places[i].place = p;
      result.places[i].user = user;
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export const createListValidation: ValidationChain[] = [
  body("name").isString(),
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

    await newList.populate("owner", readUserCompactProjection);
    await newList.populate("collaborators.user", readUserCompactProjection);

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: {
        ...newList,
        placesCount: 0,
      },
    });
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

    const deletedList = await List.findOne({
      _id: id,
      owner: authId,
    });
    await deletedList.deleteOne();

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
  param("placeId").isMongoId(),
];

export async function addToList(
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

    if (list.places?.find((p) => p.place.toString() === placeId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Place already exists" });
    }

    if (list.places)
      list.places.push({
        place: placeId as any,
        user: authId as any,
        createdAt: new Date(),
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
  param("userId").isMongoId(),
  body("access").optional().isIn(Object.values(AccessEnum)),
];

export async function addCollaborator(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id, userId } = req.params;
    const { id: authId } = req.user!;
    const { access } = req.body;

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

export const editCollaboratorAccessValidation: ValidationChain[] = [
  param("id").isMongoId(),
  param("userId").isMongoId(),
  body("access").isIn(Object.values(AccessEnum)),
];

export async function editCollaboratorAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id, userId } = req.params;
    const { id: authId } = req.user!;
    const { access } = req.body;

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
          "You don't have edit permissions to modify collaborators on this list.",
      });
    }

    const collaboratorIndex = list.collaborators.findIndex(
      (c) => c.user.toString() === userId
    );

    if (collaboratorIndex === -1) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "User does not exist in the list" });
    }

    // Edit the access of the collaborator
    list.collaborators[collaboratorIndex].access = access;

    await list.save();
    return res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const checkPlaceInUserListsValidation: ValidationChain[] = [
  param("placeId").isMongoId(),
];

export async function checkPlaceInUserLists(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!;
    const placeId = req.params.placeId;

    const lists = await List.find({
      "places.place": placeId,
      owner: authId,
    });

    res.json(lists);
  } catch (error) {
    next(error);
  }
}

export const getUserListsValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function getUserLists(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id: authId } = req.user!; //person who wants to see the lists
    const { id } = req.params; // person who has the lists (or collaborates in)

    const lists = await List.aggregate([
      {
        $match: {
          "collaborators.user": new mongoose.Types.ObjectId(id),
          $or: [
            { isPrivate: false },
            {
              "collaborators.user": new mongoose.Types.ObjectId(authId),
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
              $project: readUserCompactProjection,
            },
          ],
        },
      },
      {
        $unwind: "$owner",
      },
      {
        $project: getListOfListsDTO,
      },
    ]);

    return res.json({ success: true, data: lists });
  } catch (error) {
    next(error);
  }
}
