import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import List, { AccessEnum, type IList } from "../../models/List";
import Place, { type IPlace } from "../../models/Place";
import User, { type IUser } from "../../models/User";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { getListOfListsDTO } from "../dto/list/readLists";
import { readPlaceBriefProjection } from "../dto/place/read-place-brief.dto";
import UserProjection, { type UserEssentialsKeys } from "../dto/user/user";

export const getListValidation: ValidationChain[] = [param("id").isMongoId()];

export async function getList(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);
    const authUser = req.user!;
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
              $project: UserProjection.essentials,
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
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    // Authorization
    const isCollaborator = result.collaborators.find((c: any) =>
      authUser._id.equals(c.user)
    );
    if (result.isPrivate && !isCollaborator) {
      throw createError(
        strings.authorization.accessDenied,
        StatusCodes.UNAUTHORIZED
      );
    }

    for (let i = 0; i < result.collaborators.length; i++) {
      let user: Pick<IUser, UserEssentialsKeys> | null = await User.findById(
        result.collaborators[i].user,
        UserProjection.essentials
      ).lean();
      if (!user) {
        throw createError(
          dynamicMessage(ds.notFound, "User"),
          StatusCodes.NOT_FOUND
        );
      }
      result.collaborators[i].user = user;
    }
    for (let i = 0; i < result.places.length; i++) {
      let p: IPlace | null = await Place.findById(
        result.places[i].place,
        readPlaceBriefProjection
      ).lean();
      let user: Pick<IUser, UserEssentialsKeys> | null = await User.findById(
        result.places[i].user,
        UserProjection.essentials
      ).lean();
      if (!p) {
        throw createError(
          dynamicMessage(ds.notFound, "Place"),
          StatusCodes.NOT_FOUND
        );
      }
      if (!user) {
        throw createError(
          dynamicMessage(ds.notFound, "User"),
          StatusCodes.NOT_FOUND
        );
      }

      result.places[i].place = {
        ...p,
        location: {
          ...p.location,
          geoLocation: {
            lat: p.location.geoLocation.coordinates[1],
            lng: p.location.geoLocation.coordinates[0],
          },
        },
      };
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

    const authUser = req.user!;
    const {
      name,
      owner = authUser._id,
      collaborators = [],
      icon,
      isPrivate = false,
    } = req.body;

    let newList = await List.create({
      name,
      owner,
      collaborators,
      icon,
      isPrivate,
    });

    await Promise.all([
      newList.populate("owner", UserProjection.essentials),
      newList.populate("collaborators.user", UserProjection.essentials),
    ]);

    newList = newList.toObject();

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

    const authUser = req.user!;
    const { id } = req.params;

    const list = await List.findById(id);

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    // Check if the reaction belongs to the authenticated user
    if (!authUser._id.equals(list.owner)) {
      throw createError(strings.authorization.userOnly, StatusCodes.FORBIDDEN);
    }

    const deletedList = await List.findOne({
      _id: id,
      owner: authUser._id,
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

export const editListValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("name").optional().isString(),
  body("icon").optional().isString(),
  body("isPrivate").optional().isBoolean(),
];

export async function editList(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;
    const { id } = req.params;
    const { name, icon, isPrivate } = req.body;
    const list = (await List.findById(id)) as IList;

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }
    if (!authUser._id.equals(list.owner)) {
      throw createError("UNAUTHORIZED", StatusCodes.FORBIDDEN);
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
    let editedList = await list.save();

    await editedList.populate("owner", UserProjection.essentials);

    editedList = editedList.toObject();

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        _id: editedList._id,
        name: editedList.name,
        owner: editedList.owner,
        icon: editedList.icon,
        isPrivate: editedList.isPrivate,
        createdAt: editedList.createdAt,
        collaboratorsCount: editedList.collaborators.length,
        placesCount: editedList.places.length,
      },
    });
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
    const authUser = req.user!;
    const list = (await List.findById(id)) as IList;

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    // checking user's access level
    if (!list.collaborators || list.collaborators.length === 0) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    const collaborator = list.collaborators.find(
      (c) => c.user.equals(authUser._id) && c.access === AccessEnum.edit
    );

    if (!collaborator) {
      throw createError("UNAUTHORIZED", StatusCodes.UNAUTHORIZED);
    }

    if (list.places?.find((p) => p.place.equals(placeId))) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "Place"),
        StatusCodes.BAD_REQUEST
      );
    }

    if (list.places) {
      list.places.push({
        place: new mongoose.Types.ObjectId(placeId),
        user: authUser._id,
        createdAt: new Date(),
      });
    }

    await list.save();

    res.status(StatusCodes.OK).json({
      success: true,
      data: list,
    });
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
    const authUser = req.user!;

    const list: IList | null = await List.findById(id);

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    // checking user's access level
    if (!list.collaborators || list.collaborators.length === 0) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    const collaborator = list.collaborators.find(
      (c) => c.user.equals(authUser._id) && c.access === AccessEnum.edit
    );

    if (!collaborator) {
      throw createError("UNAUTHORIZED", StatusCodes.FORBIDDEN);
    }

    if (!list.places?.find((p) => p.place.equals(placeId))) {
      throw createError(
        dynamicMessage(ds.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }

    if (list.places) {
      list.places = list.places.filter((place) => {
        return !place.place.equals(placeId);
      });
    }

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
    const authUser = req.user!;
    const { access } = req.body;

    const list: IList | null = await List.findById(id);

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    if (!list.collaborators || list.collaborators.length === 0) {
      throw createError(
        dynamicMessage(ds.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }

    if (!authUser._id.equals(list.owner)) {
      throw createError("UNAUTHORIZED", StatusCodes.UNAUTHORIZED);
    }

    if (list.collaborators?.find((c) => c.user.equals(userId))) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "User"),
        StatusCodes.BAD_REQUEST
      );
    }

    list.collaborators.push({
      user: new mongoose.Types.ObjectId(userId),
      access: access,
    });

    await list.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      data: list,
    });
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
    const authUser = req.user!;

    const list: IList | null = await List.findById(id);

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    // checking user's access level
    if (!list.collaborators || list.collaborators.length === 0) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    if (!authUser._id.equals(list.owner)) {
      throw createError("UNAUTHORIZED", StatusCodes.UNAUTHORIZED);
    }
    if (list.owner.equals(userId)) {
      throw createError(
        "you can't remove the owner of the list",
        StatusCodes.BAD_REQUEST
      );
    }

    if (!list.collaborators?.find((c) => c.user.equals(userId))) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    if (list.collaborators) {
      list.collaborators = list.collaborators.filter((collaborator) => {
        return collaborator.user.toString() !== userId;
      });
    }

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
    const authUser = req.user!;
    const { access } = req.body;

    const list: IList | null = await List.findById(id);

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    // checking user's access level
    if (!list.collaborators || list.collaborators.length === 0) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    if (!list.owner.equals(authUser._id)) {
      throw createError("UNAUTHORIZED", StatusCodes.UNAUTHORIZED);
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

    return res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
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

    const authUser = req.user!; //person who wants to see the lists
    const { id } = req.params; // person who has the lists (or collaborates in)

    const lists = await List.aggregate([
      {
        $match: {
          "collaborators.user": new mongoose.Types.ObjectId(id),
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
        $project: getListOfListsDTO,
      },
    ]);

    return res.json({ success: true, data: lists });
  } catch (error) {
    next(error);
  }
}
