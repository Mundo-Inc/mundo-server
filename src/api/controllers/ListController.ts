import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import List, { AccessEnum } from "../../models/List";
import Place from "../../models/Place";
import User from "../../models/User";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import PlaceProjection, { type PlaceProjectionBrief } from "../dto/place";
import UserProjection, { type UserProjectionEssentials } from "../dto/user";

export const getListValidation: ValidationChain[] = [param("id").isMongoId()];

export async function getList(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

    const list = await List.aggregate([
      {
        $match: {
          _id: id,
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
    ]).then((result) => result[0]);

    if (!list) {
      throw createError(
        dynamicMessage(ds.notFound, "List"),
        StatusCodes.NOT_FOUND
      );
    }

    if (list.isPrivate) {
      const isCollaborator = list.collaborators.some((c: any) =>
        authUser._id.equals(c.user)
      );
      if (!isCollaborator) {
        throw createError(
          strings.authorization.accessDenied,
          StatusCodes.FORBIDDEN
        );
      }
    }

    for (let i = 0; i < list.collaborators.length; i++) {
      let user = await User.findById(list.collaborators[i].user)
        .select<UserProjectionEssentials>(UserProjection.essentials)
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "User"),
            StatusCodes.NOT_FOUND
          )
        )
        .lean();
      list.collaborators[i].user = user;
    }
    for (let i = 0; i < list.places.length; i++) {
      const [p, user] = await Promise.all([
        Place.findById(list.places[i].place)
          .select<PlaceProjectionBrief>(PlaceProjection.brief)
          .orFail(
            createError(
              dynamicMessage(ds.notFound, "Place"),
              StatusCodes.NOT_FOUND
            )
          )
          .lean(),
        User.findById(list.places[i].user)
          .orFail(
            createError(
              dynamicMessage(ds.notFound, "User"),
              StatusCodes.NOT_FOUND
            )
          )
          .select<UserProjectionEssentials>(UserProjection.essentials)
          .lean(),
      ]);

      list.places[i].place = {
        ...p,
        location: {
          ...p.location,
          geoLocation: {
            lat: p.location.geoLocation.coordinates[1],
            lng: p.location.geoLocation.coordinates[0],
          },
        },
      };
      list.places[i].user = user;
    }

    return res.json({ success: true, data: list });
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

    const name: string = req.body.name;
    const collaborators: mongoose.Types.ObjectId[] = req.body.collaborators
      ? (req.body.collaborators as string[]).map(
          (id) => new mongoose.Types.ObjectId(id)
        )
      : [];
    const icon: string | undefined = req.body.icon;
    const isPrivate: boolean = req.body.isPrivate || false;

    let newList = await List.create({
      name,
      owner: authUser._id,
      collaborators,
      icon,
      isPrivate,
    });

    await Promise.all([
      newList.populate("owner", UserProjection.essentials),
      newList.populate("collaborators.user", UserProjection.essentials),
    ]);

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: {
        ...newList.toObject(),
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
    const id = new mongoose.Types.ObjectId(req.params.id);

    const list = await List.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND)
    );

    // Check if the reaction belongs to the authenticated user
    if (!authUser._id.equals(list.owner)) {
      throw createError(strings.authorization.userOnly, StatusCodes.FORBIDDEN);
    }

    const deletedList = await list.deleteOne();

    if (deletedList.deletedCount === 0) {
      throw createError(
        "Error deleting the list",
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

    const id = new mongoose.Types.ObjectId(req.params.id);
    const name: string | undefined = req.body.name;
    const icon: string | undefined = req.body.icon;
    const isPrivate: boolean | undefined = req.body.isPrivate;

    const list = await List.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND)
    );

    if (!authUser._id.equals(list.owner)) {
      throw createError(
        "You're not the owner of this list",
        StatusCodes.FORBIDDEN
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

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        _id: list._id,
        name: list.name,
        owner: list.owner,
        icon: list.icon,
        isPrivate: list.isPrivate,
        createdAt: list.createdAt,
        collaboratorsCount: list.collaborators.length,
        placesCount: list.places.length,
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);
    const placeId = new mongoose.Types.ObjectId(req.params.placeId);

    const list = await List.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND)
    );

    const isCollaborator = list.collaborators.some(
      (c) => c.user.equals(authUser._id) && c.access === AccessEnum.edit
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
      place: new mongoose.Types.ObjectId(placeId),
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);
    const placeId = new mongoose.Types.ObjectId(req.params.placeId);

    const list = await List.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND)
    );

    const isCollaborator = list.collaborators.some(
      (c) => c.user.equals(authUser._id) && c.access === AccessEnum.edit
    );

    if (!isCollaborator) {
      throw createError(
        "You're not a collaborator of this list",
        StatusCodes.FORBIDDEN
      );
    }

    if (!list.places.some((p) => p.place.equals(placeId))) {
      throw createError(
        dynamicMessage(ds.notFound, "Place"),
        StatusCodes.NOT_FOUND
      );
    }

    list.places = list.places.filter((place) => {
      return !place.place.equals(placeId);
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);
    const userId = new mongoose.Types.ObjectId(req.params.userId);

    const access: AccessEnum = req.body.access || AccessEnum.edit;

    const list = await List.findById(id).orFail(
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);
    const userId = new mongoose.Types.ObjectId(req.params.userId);

    const list = await List.findById(id).orFail(
      createError(dynamicMessage(ds.notFound, "List"), StatusCodes.NOT_FOUND)
    );

    if (!authUser._id.equals(list.owner)) {
      throw createError(
        "You're not the owner of this list",
        StatusCodes.FORBIDDEN
      );
    }

    if (list.owner.equals(userId)) {
      throw createError(
        "you can't remove the owner of the list",
        StatusCodes.BAD_REQUEST
      );
    }

    if (!list.collaborators.some((c) => c.user.equals(userId))) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    list.collaborators = list.collaborators.filter((collaborator) => {
      return !collaborator.user.equals(userId);
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);
    const userId = new mongoose.Types.ObjectId(req.params.userId);
    const access: AccessEnum = req.body.access;

    const list = await List.findById(id).orFail(
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

    const authUser = req.user!;

    const id = new mongoose.Types.ObjectId(req.params.id);

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
