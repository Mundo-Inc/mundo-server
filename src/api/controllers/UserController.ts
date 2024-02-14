import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { body, param, query, type ValidationChain } from "express-validator";
import { getAuth } from "firebase-admin/auth";
import { StatusCodes } from "http-status-codes";

import Block from "../../models/Block";
import CheckIn from "../../models/CheckIn";
import Follow from "../../models/Follow";
import FollowRequest, { IFollowRequest } from "../../models/FollowRequest";
import Place, { type IPlace } from "../../models/Place";
import Review from "../../models/Review";
import User, {
  SignupMethodEnum,
  type IUser,
  type UserDevice,
} from "../../models/User";
import strings, { dStrings as ds, dynamicMessage } from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import { bucketName, s3 } from "../../utilities/storage";
import {
  PrivateReadUserDto,
  privateReadUserProjection,
} from "../dto/user/read-user-private.dto";
import { publicReadUserProjection } from "../dto/user/read-user-public.dto";
import { handleSignUp } from "../lib/profile-handlers";
import { calcRemainingXP } from "../services/reward/helpers/levelCalculations";
import { sendSlackMessage } from "./SlackController";
import validate from "./validators";
import CoinReward, { CoinRewardTypeEnum } from "../../models/CoinReward";

// const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;

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

    const authId = req.user?.id;

    const { q } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let users = [];

    if (q) {
      users = await User.aggregate([
        {
          $match: {
            $or: [
              { name: { $regex: q, $options: "i" } },
              { username: { $regex: q, $options: "i" } },
            ],
          },
        },
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
        {
          $lookup: {
            from: "achievements",
            localField: "progress.achievements",
            foreignField: "_id",
            as: "progress.achievements",
          },
        },
        {
          $project: publicReadUserProjection,
        },
      ]);
    } else if (authId) {
      const followings = await Follow.find({ user: authId })
        .populate({
          path: "target",
          select: publicReadUserProjection,
          populate: {
            path: "progress.achievements",
          },
        })
        .skip(skip)
        .limit(limit)
        .lean();

      users = followings.map((following) => following.target);
    }

    if (users.length === 0 && authId) {
      const followers = await Follow.find({ target: authId })
        .populate({
          path: "user",
          select: publicReadUserProjection,
          populate: {
            path: "progress.achievements",
          },
        })
        .skip(skip)
        .limit(limit)
        .lean();

      users = followers.map((follower) => follower.user);
    }

    for (const user of users) {
      const achievements: any = {};
      if (user) {
        for (const achievement of user.progress.achievements) {
          if (achievement.type in achievements) {
            achievements[achievement.type].createdAt = achievement.createdAt;
            achievements[achievement.type].count++;
          } else {
            achievements[achievement.type] = {
              _id: achievement.type,
              type: achievement.type,
              createdAt: achievement.createdAt,
              count: 1,
            };
          }
        }
      }
      user.progress.achievements = Object.values(achievements);
    }

    res.status(StatusCodes.OK).json({ success: true, data: users });
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

    newUser.accepted_eula = new Date();
    await newUser.save();

    await getAuth().createUser({
      uid: newUser._id.toString(),
      email: email.toLowerCase(),
      emailVerified: false,
      password: password,
      disabled: false,
    });

    try {
      sendSlackMessage(
        "phantomAssistant",
        `New user: ${newUser.name || "- - -"}\n${newUser.username} (${
          newUser.email.address
        })`
      );
    } catch (error) {
      console.log(error);
    }

    // Sign in to get the Firebase ID token
    // const signInResponse = await axios.post(
    //   `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
    //   {
    //     email: email.toLowerCase(),
    //     password: password,
    //     returnSecureToken: true,
    //   }
    // );
    // const fbasetoken = signInResponse.data.idToken;

    // TODO: Response data is unused, can be removed on later app versions (0.43.0+)
    res.status(StatusCodes.CREATED).send({ userId: newUser._id, token: "" });
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

    const leaderboard = await User.aggregate([
      { $match: { source: { $ne: "yelp" } } },
      {
        $sort: {
          "progress.xp": -1,
          createdAt: -1,
        },
      },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "achievements",
          localField: "progress.achievements",
          foreignField: "_id",
          as: "progress.achievements",
        },
      },
      {
        $project: publicReadUserProjection,
      },
    ]);

    for (const user of leaderboard) {
      const achievements: any = {};
      if (user) {
        for (const achievement of user.progress.achievements) {
          if (achievement.type in achievements) {
            achievements[achievement.type].createdAt = achievement.createdAt;
            achievements[achievement.type].count++;
          } else {
            achievements[achievement.type] = {
              _id: achievement.type,
              type: achievement.type,
              createdAt: achievement.createdAt,
              count: 1,
            };
          }
        }
      }
      user.progress.achievements = Object.values(achievements);
    }

    res.status(StatusCodes.OK).json({ success: true, data: leaderboard });
  } catch (err) {
    next(err);
  }
}

export const getUserValidation: ValidationChain[] = [
  param("id").custom((value, { req }) => {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (objectIdRegex.test(value) || value.includes("@")) {
      return true; // Indicate that the validation is successful
    } else {
      if (req.query?.idType !== "uid") {
        throw new Error('The id must be a valid ObjectId or must include "@"');
      } else {
        return true;
      }
    }
  }),
  query("idType").optional().isIn(["oid", "uid"]),
  query("view").optional().isIn(["basic", "contextual"]),
];
export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    handleInputErrors(req);

    const authId = req.user?.id;
    let { id } = req.params;
    const { idType } = req.query;
    const view = req.query.view || "contextual";

    if (idType === "uid") {
      // if id type is uid -> get user by uid
      const user: IUser | null = await User.findOne({ uid: id }).lean();

      if (user) {
        id = user._id.toString();
      } else {
        throw createError(
          dynamicMessage(ds.notFound, "User"),
          StatusCodes.NOT_FOUND
        );
      }
    } else if (id[0] == "@") {
      // if id starts with @ -> get user by username
      const user: IUser | null = await User.findOne({
        username: {
          $regex: `^${id.slice(1)}$`,
          $options: "i",
        },
      }).lean();

      if (user) {
        id = user._id.toString();
      } else {
        throw createError(
          dynamicMessage(ds.notFound, "User"),
          StatusCodes.NOT_FOUND
        );
      }
    }

    let user: any;
    let isFollower, isFollowing;

    if (authId && id === authId) {
      // own profile

      user = await User.findById(id, privateReadUserProjection)
        .populate({
          path: "progress.achievements",
          select: "type createdAt",
        })
        .lean();

      const achievements: any = {};
      if (user) {
        for (const achievement of user.progress.achievements) {
          if (achievement.type in achievements) {
            achievements[achievement.type].createdAt = achievement.createdAt;
            achievements[achievement.type].count++;
          } else {
            achievements[achievement.type] = {
              _id: achievement.type,
              type: achievement.type,
              createdAt: achievement.createdAt,
              count: 1,
            };
          }
        }
      }
      user.progress.achievements = Object.values(achievements);
    } else if (authId && view === "contextual") {
      // contextual view

      const isBlocked = await Block.findOne({
        $or: [
          { user: id, target: authId },
          { user: authId, target: id },
        ],
      });

      if (isBlocked) {
        if (isBlocked.user.toString() === authId) {
          throw createError(
            strings.blocks.user.isBlocked,
            StatusCodes.FORBIDDEN
          );
        } else {
          throw createError(
            strings.blocks.user.hasBlocked,
            StatusCodes.FORBIDDEN
          );
        }
      }

      user = await User.findById(id, publicReadUserProjection)
        .populate({
          path: "progress.achievements",
          select: "type createdAt",
        })
        .lean();

      const achievements: any = {};
      if (user) {
        for (const achievement of user.progress.achievements) {
          if (achievement.type in achievements) {
            achievements[achievement.type].createdAt = achievement.createdAt;
            achievements[achievement.type].count++;
          } else {
            achievements[achievement.type] = {
              _id: achievement.type,
              type: achievement.type,
              createdAt: achievement.createdAt,
              count: 1,
            };
          }
        }
      }
      user.progress.achievements = Object.values(achievements);

      isFollower =
        (await Follow.findOne({ user: id, target: authId }).lean()) != null;

      isFollowing =
        (await Follow.findOne({ user: authId, target: id }).lean()) != null;
    } else if (view === "basic") {
      // basic view

      user = await User.findById(id, publicReadUserProjection)
        .populate({
          path: "progress.achievements",
          select: "type createdAt",
        })
        .lean();

      const achievements: any = {};
      if (user) {
        for (const achievement of user.progress.achievements) {
          if (achievement.type in achievements) {
            achievements[achievement.type].createdAt = achievement.createdAt;
            achievements[achievement.type].count++;
          } else {
            achievements[achievement.type] = {
              _id: achievement.type,
              type: achievement.type,
              createdAt: achievement.createdAt,
              count: 1,
            };
          }
        }
      }
      user.progress.achievements = Object.values(achievements);
    } else {
      throw createError(
        strings.authorization.loginRequired,
        StatusCodes.FORBIDDEN
      );
    }

    if (!user) {
      throw createError(
        dynamicMessage(ds.notFound, "User"),
        StatusCodes.NOT_FOUND
      );
    }

    const rank = await User.countDocuments({
      source: { $ne: "yelp" },
      "progress.xp": {
        $gt: user.progress.xp,
      },
    }).sort({
      createdAt: -1,
    });

    const followersCount = await Follow.countDocuments({ target: id });
    const followingCount = await Follow.countDocuments({ user: id });
    const reviewsCount = await Review.countDocuments({ writer: id });
    const totalCheckins = await CheckIn.countDocuments({ user: id });

    const result: any = {
      ...user,
      followersCount,
      followingCount,
      reviewsCount,
      totalCheckins,
      rank: rank + 1,
      remainingXp: calcRemainingXP((user.progress && user.progress.xp) || 0),
    };

    if (view === "contextual") {
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
  body("eula").optional().isBoolean(),
  body("referrer").optional().isMongoId(),
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

    const user = await User.findById(id);

    const { name, bio, username, removeProfileImage, eula, referrer } =
      req.body;

    if (referrer) {
      if (user.accepted_eula) {
        throw createError(
          "Cannot set referrer after signing up",
          StatusCodes.BAD_REQUEST
        );
      }
      if (user.referrer) {
        throw createError("Referrer already set", StatusCodes.BAD_REQUEST);
      }
      if (!eula) {
        throw createError("EULA must be accepted", StatusCodes.BAD_REQUEST);
      }

      const referredBy = await User.findById(referrer);
      if (!referredBy) {
        throw createError(
          dynamicMessage(ds.notFound, "Referrer"),
          StatusCodes.NOT_FOUND
        );
      }

      user.referredBy = referrer;
      user.phantomCoins.balance += 250;
      await CoinReward.create({
        userId: user._id,
        amount: 250,
        coinRewardType: CoinRewardTypeEnum.referral,
      });

      referredBy.phantomCoins.balance += 250;
      await referredBy.save();
      await CoinReward.create({
        userId: referredBy._id,
        amount: 250,
        coinRewardType: CoinRewardTypeEnum.referral,
      });
    }

    if (name) {
      user.name = name;
    }
    if (bio) {
      user.bio = bio;
    }
    if (username) {
      user.username = username;
    }
    if (eula) {
      user.accepted_eula = new Date();
    }

    if (removeProfileImage === true) {
      user.profileImage = "";
      s3.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: `${id}/profile.jpg`,
        })
      );
    }

    try {
      await user.save();
    } catch (err: any) {
      if (err.code === 11000) {
        throw createError(strings.user.usernameTaken, StatusCodes.CONFLICT);
      }
    }

    const updatedUser: any = await User.findById(id, privateReadUserProjection)
      .populate("progress.achievements")
      .lean();

    const achievements: any = {};
    if (updatedUser) {
      for (const achievement of updatedUser.progress.achievements) {
        if (achievement.type in achievements) {
          achievements[achievement.type].createdAt = achievement.createdAt;
          achievements[achievement.type].count++;
        } else {
          achievements[achievement.type] = {
            _id: achievement.type,
            type: achievement.type,
            createdAt: achievement.createdAt,
            count: 1,
          };
        }
      }
    }
    updatedUser.progress.achievements = Object.values(achievements);

    res.status(StatusCodes.OK).json({
      success: true,
      data: updatedUser,
    });
  } catch (err) {
    next(err);
  }
}

export const deleteUserValidation: ValidationChain[] = [
  param("id").isMongoId(),
];
export async function deleteUser(
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
    const user = await User.findById(id);
    if (!user) throw createError(strings.user.notFound, StatusCodes.NOT_FOUND);

    await user.deleteOne();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const userPrivacyValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("isPrivate").isBoolean(),
];
export async function putUserPrivacy(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { id } = req.params;
    const { isPrivate } = req.body;
    const { id: authId, role: authRole } = req.user!;

    if (id !== authId && authRole !== "admin") {
      throw createError("UNAUTHORIZED", StatusCodes.FORBIDDEN);
    }

    const user = (await User.findById(id)) as IUser;

    if (user.isPrivate && !isPrivate) {
      const followReqs = (await FollowRequest.find({
        target: authId,
      })) as IFollowRequest[];
      for (const followReq of followReqs) {
        await Follow.create({
          user: followReq.user,
          target: followReq.target,
        });
      }
    }

    user.isPrivate = isPrivate;
    await user.save();

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}

export const userSettingsValidation: ValidationChain[] = [
  param("id").isMongoId(),
  body("action").isIn(["deviceToken"]),
  body("token").if(body("action").equals("deviceToken")).optional().isString(),
  body("apnToken")
    .if(body("action").equals("deviceToken"))
    .optional()
    .isString(),
  body("fcmToken")
    .if(body("action").equals("deviceToken"))
    .optional()
    .isString(),
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
      let { token, apnToken, fcmToken, platform } = req.body;
      apnToken = apnToken || token;
      if ((!token && !apnToken && !fcmToken) || !platform) {
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
        (device: UserDevice) =>
          device.apnToken === apnToken || device.fcmToken === fcmToken
      );
      if (found) {
        if (found.fcmToken !== fcmToken) {
          found.fcmToken = fcmToken;
          await user.save();
        } else if (found.apnToken !== apnToken) {
          found.apnToken = apnToken;
          await user.save();
        }
      } else {
        user.devices.push({ apnToken, fcmToken, platform });
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

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
