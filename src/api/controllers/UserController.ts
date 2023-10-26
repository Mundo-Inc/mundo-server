import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { readFileSync, unlinkSync } from "fs";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";

import { config } from "../../config";
import Follow from "../../models/Follow";
import Place, { type IPlace } from "../../models/Place";
import Review from "../../models/Review";
import User, { SignupMethodEnum } from "../../models/User";
import strings, {
  dStrings,
  dStrings as ds,
  dynamicMessage,
} from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { bucketName, parseForm, region, s3 } from "../../utilities/storage";
import { type EditUserDto } from "../dto/user/edit-user.dto";
import {
  PrivateReadUserDto,
  privateReadUserProjection,
} from "../dto/user/read-user-private.dto";
import {
  publicReadUserProjection,
  type PublicReadUserDto,
} from "../dto/user/read-user-public.dto";
import { handleSignUp } from "../lib/profile-handlers";
import {
  addNewFollowingXP,
  getRemainingXpToNextLevel,
} from "../services/ranking.service";
import { addNewFollowingActivity } from "../services/user.activity.service";
import validate from "./validators";
import UserActivity, {
  ActivityTypeEnum,
  ResourceTypeEnum,
} from "../../models/UserActivity";
import mongoose from "mongoose";
import Notification, { ResourceTypes } from "../../models/Notification";

export const getUsersValidation: ValidationChain[] = [
  validate.q(query("q").optional()),
  validate.page(query("page").optional(), 100),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { q } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    // const users = await User.find(
    //   { isActive: true },
    //   publicReadUserProjection
    // )
    //   .skip(skip)
    //   .limit(limit)
    //   .lean();
    // const result = await Promise.all(
    //   users.map(async (u) => ({
    //     ...u,
    //     followersCount: (await Follow.find({ target: u._id })).length,
    //     followingCount: (await Follow.find({ user: u._id })).length,
    //     reviewsCount: (await Review.find({ writer: u._id })).length,
    //   }))
    // );

    const matchObject: {
      [key: string]: any;
    } = {
      isActive: true,
    };
    if (q) {
      matchObject["$or"] = [
        { name: { $regex: q, $options: "i" } },
        { username: { $regex: q, $options: "i" } },
      ];
    }

    const matchPipeline = [];
    if (Object.keys(matchObject).length !== 0) {
      matchPipeline.push({ $match: matchObject });
    }

    let result = await User.aggregate([
      ...matchPipeline,
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $project: publicReadUserProjection,
      },
    ]).exec();

    result = result.map((user: PublicReadUserDto) => ({
      ...user,
      remainingXp: getRemainingXpToNextLevel(user.xp || 0),
    }));

    res.status(StatusCodes.OK).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export const createUserValidation: ValidationChain[] = [
  validate.email(body("email")),
  validate.password(body("password")),
  validate.name(body("name")),
  validate.username(body("username").optional()),
];
export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { name, username, email, password } = req.body;

    const existingUser = await User.findOne({
      "email.address": { $regex: new RegExp(email, "i") },
    });

    if (existingUser) {
      throw createError(
        dynamicMessage(ds.alreadyExists, "User"),
        StatusCodes.CONFLICT
      );
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await handleSignUp(
      email.toLowerCase(),
      name,
      username,
      SignupMethodEnum.traditional,
      hashedPassword
    );

    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role },
      config.JWT_SECRET,
      {
        expiresIn: "30d",
      }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      maxAge: +process.env.JWT_MAX_AGE!,
      sameSite: "strict",
      path: "/",
    });

    res.status(StatusCodes.CREATED).json({ userId: newUser._id, token });
  } catch (err) {
    next(err);
  }
}

export const leaderBoardValidation: ValidationChain[] = [
  validate.page(query("page").optional(), 100),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getLeaderBoard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    if (page * limit > 100) {
      return res.status(StatusCodes.OK).json({
        success: true,
        data: [],
      });
    }

    const leaderboard = await User.aggregate([
      {
        $sort: {
          xp: -1,
        },
      },
      { $skip: skip },
      { $limit: limit },
      {
        $project: publicReadUserProjection,
      },
    ]);

    res.status(StatusCodes.OK).json({ success: true, data: leaderboard });
  } catch (err) {
    next(err);
  }
}

export const getUserValidation: ValidationChain[] = [param("id").isMongoId()];
export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);
    const { id } = req.params;

    const followersCount = await Follow.countDocuments({ target: id });
    const followingCount = await Follow.countDocuments({ user: id });
    const reviewsCount = await Review.countDocuments({ writer: id });

    let user: any, isFollower, isFollowing;
    if (id === req.user!.id) {
      user = await User.findById(id, privateReadUserProjection)
        .populate("progress.achievements")
        .lean();
    } else {
      user = await User.findById(id, publicReadUserProjection)
        .populate("progress.achievements")
        .lean();

      isFollower =
        (await Follow.findOne({ user: id, target: req.user!.id }).lean()) !=
        null;
      isFollowing =
        (await Follow.findOne({ user: req.user!.id, target: id }).lean()) !=
        null;
    }
    if (!user) {
      throw createError(
        dynamicMessage(dStrings.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    const rank = await User.aggregate([
      {
        $match: {
          xp: {
            $gt: user.xp,
          },
        },
      },
      {
        $count: "rank",
      },
    ]);

    const result = {
      ...user,
      followersCount,
      followingCount,
      reviewsCount,
      rank: rank[0]?.rank + 1 || 1,
      remainingXp: getRemainingXpToNextLevel(user.xp || 0),
    };

    if (id !== req.user!.id) {
      result.isFollower = isFollower;
      result.isFollowing = isFollowing;
    }

    res.status(StatusCodes.OK).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export const editUserValidation: ValidationChain[] = [
  param("id").isMongoId(),
  validate.name(body("name").optional()),
  validate.bio(body("bio").optional()),
  validate.username(body("username").optional()),
  body("removeProfileImage").optional().isBoolean(),
];
export async function editUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { id } = req.params;

    if (id !== req.user!.id && req.user!.role !== "admin") {
      throw createError(
        strings.authorization.accessDenied,
        StatusCodes.FORBIDDEN
      );
    }

    const { name, bio, username, removeProfileImage } = req.body;

    const editUserDto: EditUserDto = {};
    if (name) {
      editUserDto.name = name;
    }
    if (bio) {
      editUserDto.bio = bio;
    }
    if (username) {
      editUserDto.username = username;
    }

    if (removeProfileImage === true) {
      editUserDto.profileImage = "";
      s3.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: `${id}/profile.jpg`,
        })
      );
    }

    await User.updateOne({ _id: id }, editUserDto).catch((err) => {
      if (err.code === 11000) {
        throw createError(strings.user.usernameTaken, StatusCodes.CONFLICT);
      }
    });

    const updatedUser = await User.findById(id, privateReadUserProjection)
      .populate("progress.achievements")
      .lean();

    res.status(StatusCodes.OK).json({
      success: true,
      data: updatedUser as PrivateReadUserDto,
    });
  } catch (err) {
    next(err);
  }
}

export const userSettingsValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("action").isIn(["deviceToken"]),
  body("token").if(body("action").equals("deviceToken")).isString(),
  body("platform").if(body("action").equals("deviceToken")).isString(),
];
export async function putUserSettings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const { id: authId, role: authRole } = req.user!;

    if (id !== authId && authRole !== "admin") {
      throw createError(
        strings.authorization.accessDenied,
        StatusCodes.FORBIDDEN
      );
    }
    const { action } = req.body;

    if (action === "deviceToken") {
      const { token, platform } = req.body;
      if (!token || !platform) {
        throw createError(
          strings.validations.missRequiredFields,
          StatusCodes.BAD_REQUEST
        );
      }
      const user = await User.findById(id, ["devices"]);
      if (!user) {
        throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);
      }
      const found = user.devices.find(
        (device: { token: string; platform: string }) => device.token === token
      );
      if (!found) {
        user.devices.push({ token, platform });
        await user.save();
      }
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const getLatestPlaceValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function getLatestPlace(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    let user: any;
    if (id === req.user!.id || req.user!.role === "admin") {
      user = await User.findById(id, {
        latestPlace: true,
      }).lean();
      if (!user) {
        throw createError(strings.user.notFound, StatusCodes.BAD_REQUEST);
      }
    } else {
      throw createError(strings.authorization.adminOnly, StatusCodes.FORBIDDEN);
    }

    if (!user.latestPlace) {
      throw createError(strings.user.noLatestPlace, StatusCodes.NOT_FOUND);
    }
    let latestPlace: any = (await Place.findById(user.latestPlace, {
      _id: true,
      name: true,
      location: true,
    }).lean()) as IPlace | null;

    if (latestPlace) {
      latestPlace.location.geoLocation = {
        lat: latestPlace.location.geoLocation.coordinates[1],
        lng: latestPlace.location.geoLocation.coordinates[0],
      };
    } else {
      latestPlace = null;
    }

    res.status(StatusCodes.OK).json({ success: true, data: latestPlace });
  } catch (err) {
    next(err);
  }
}

export const createUserConnectionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function createUserConnection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const { id: authId } = req.user!;

    let follow = await Follow.findOne({ user: authId, target: id });
    if (follow) {
      throw createError(strings.follows.alreadyExists, StatusCodes.CONFLICT);
    }
    follow = await Follow.create({
      user: authId,
      target: id,
    });
    try {
      const _act = await addNewFollowingActivity(authId, id as string);
      if (_act) {
        await addNewFollowingXP(authId);
      }
    } catch (e) {
      console.log(`Something happened during create following: ${e}`);
    }
    res.status(StatusCodes.CREATED).json({ success: true, data: follow });
  } catch (err) {
    next(err);
  }
}

export const deleteUserConnectionValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function deleteUserConnection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const { id: authId } = req.user!;

    const deletedDoc = await Follow.findOneAndRemove({
      user: authId,
      target: id,
    });

    try {
      await UserActivity.findOneAndRemove({
        userId: new mongoose.Types.ObjectId(authId),
        resourceId: new mongoose.Types.ObjectId(id as string),
        activityType: ActivityTypeEnum.FOLLOWING,
        resourceType: ResourceTypeEnum.USER,
      });

      await Notification.findOneAndRemove({
        resources: {
          $elemMatch: { _id: deletedDoc._id, type: ResourceTypes.FOLLOW },
        },
      });
    } catch (e) {
      console.log(`Error deleting "Follow": ${e}`);
    }

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const getUserConnectionsValidation: ValidationChain[] = [
  param("id").isMongoId(),
  param("type").isIn(["followers", "followings"]),
  validate.page(query("page").optional(), 100),
  validate.limit(query("limit").optional(), 1, 50),
];
export async function getUserConnections(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id, type } = req.params;
    const { id: authId } = req.user!;

    const { limit, page } = req.query;
    const limitNumber = parseInt(limit as string) || 50;
    const skipNumber = (parseInt(page as string) - 1) * limitNumber || 0;

    const theUserId = id || authId;

    const userExists = await User.findById(theUserId).lean();
    if (!userExists) {
      throw createError(strings.user.notFound, 404);
    }

    const data = await Follow.aggregate([
      {
        $match: {
          [type === "followers" ? "target" : "user"]:
            new mongoose.Types.ObjectId(theUserId as string),
        },
      },
      {
        $skip: skipNumber,
      },
      {
        $limit: limitNumber,
      },
      {
        $lookup: {
          from: "users",
          localField: type === "followers" ? "user" : "target",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              $lookup: {
                from: "achievements",
                localField: "progress.achievements",
                foreignField: "_id",
                as: "progress.achievements",
              },
            },
          ],
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          user: publicReadUserProjection,
          createdAt: 1,
        },
      },
    ]);

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * optional auth
 * username-availablity/:username
 */
export const usernameAvailabilityValidation: ValidationChain[] = [
  param("username").isString(),
];
export async function usernameAvailability(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { username } = req.params;
    const authId = req.user?.id;

    if (!username) {
      throw createError(
        strings.validations.missRequiredFields,
        StatusCodes.BAD_REQUEST
      );
    }

    const usernameRegex = /^[a-zA-Z0-9_]{5,20}$/;
    if (!usernameRegex.test(username as string)) {
      if (username.length < 5) {
        throw createError(
          strings.validations.invalidUsernameLength,
          StatusCodes.BAD_REQUEST
        );
      }
      throw createError(
        strings.validations.invalidUsername,
        StatusCodes.BAD_REQUEST
      );
    }

    let user;
    if (authId) {
      user = await User.findOne({
        username: {
          $regex: `^${username}$`,
          $options: "i",
        },
        _id: {
          $ne: authId,
        },
      });
    } else {
      user = await User.findOne({
        username: {
          $regex: `^${username}$`,
          $options: "i",
        },
      });
    }

    if (user) {
      throw createError(strings.user.usernameTaken, StatusCodes.CONFLICT);
    }

    res.status(StatusCodes.NO_CONTENT).end();
  } catch (err) {
    next(err);
  }
}
