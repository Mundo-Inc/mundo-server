import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { PlaceProjectionBrief } from "../../../api/dto/place.js";
import PlaceProjection from "../../../api/dto/place.js";
import type { UserProjectionEssentials } from "../../../api/dto/user.js";
import UserProjection from "../../../api/dto/user.js";
import List from "../../../models/List.js";
import Place from "../../../models/Place.js";
import User from "../../../models/User.js";
import strings, { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  listId: zObjectId,
});

type Params = z.infer<typeof params>;

export const getListValidation = validateData({
  params: params,
});

export async function getList(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = req.user!;

    const { listId } = req.params as unknown as Params;

    const list = await List.aggregate([
      {
        $match: {
          _id: listId,
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
        StatusCodes.NOT_FOUND,
      );
    }

    if (list.isPrivate) {
      const isCollaborator = list.collaborators.some((c: any) =>
        authUser._id.equals(c.user),
      );
      if (!isCollaborator) {
        throw createError(
          strings.authorization.accessDenied,
          StatusCodes.FORBIDDEN,
        );
      }
    }

    for (let i = 0; i < list.collaborators.length; i++) {
      let user = await User.findById(list.collaborators[i].user)
        .select<UserProjectionEssentials>(UserProjection.essentials)
        .orFail(
          createError(
            dynamicMessage(ds.notFound, "User"),
            StatusCodes.NOT_FOUND,
          ),
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
              StatusCodes.NOT_FOUND,
            ),
          )
          .lean(),
        User.findById(list.places[i].user)
          .orFail(
            createError(
              dynamicMessage(ds.notFound, "User"),
              StatusCodes.NOT_FOUND,
            ),
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
