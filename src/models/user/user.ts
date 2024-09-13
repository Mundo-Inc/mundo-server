import mongoose, {
  Schema,
  Types,
  type CallbackError,
  type Model,
} from "mongoose";
import { z } from "zod";

import DeletionService from "../../api/services/deletionService.js";
import Achievement from "../achievement.js";
import CheckIn from "../checkIn.js";
import Comment from "../comment.js";
import Flag from "../flag.js";
import Follow from "../follow.js";
import List from "../list.js";
import Media from "../media.js";
import Reaction from "../reaction.js";
import Review from "../review.js";
import { userAppUsageSchema, zUserAppUsageSchema } from "./userAppUsage.js";
import { userDeviceSchema, zUserDeviceSchema } from "./userDevice.js";
import { zUserEarningsSchema } from "./userEarnings.js";
import { userProgressSchema, zUserProgressSchema } from "./userProgress.js";
import { userStripeSchema, zUserStripeSchema } from "./userStripe.js";

export enum UserRoleEnum {
  Admin = "admin",
  User = "user",
}

export enum SignupMethodEnum {
  Social = "social",
  Traditional = "traditional",
  Cloud = "cloud",
  Bot = "bot",
}

export const zUserSchema = z.object({
  _id: z.instanceof(Types.ObjectId),
  accepted_eula: z.date().optional(),
  uid: z.string().optional(),
  username: z.string(),
  name: z.string(),
  email: z.object({
    address: z.string(),
    verified: z.boolean(),
  }),
  phone: z
    .object({
      number: z.string(),
      verified: z.boolean(),
    })
    .optional(),
  profileImage: z.string(),
  bio: z.string(),
  role: z.nativeEnum(UserRoleEnum),
  isPrivate: z.boolean(),
  signupMethod: z.nativeEnum(SignupMethodEnum),
  devices: z.array(zUserDeviceSchema),
  progress: zUserProgressSchema,
  verified: z.boolean(),
  earnings: zUserEarningsSchema,
  latestPlace: z.instanceof(Types.ObjectId).optional(),
  referredBy: z.instanceof(Types.ObjectId).optional(),
  mundoInteractionFrequency: z.number().optional(),
  stripe: zUserStripeSchema,
  appUsage: zUserAppUsageSchema,
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),

  /**
   * @deprecated
   */
  source: z.enum(["yelp", "google"]).optional(),

  /**
   * @deprecated
   */
  password: z.string().optional(),
});

export type IUser = z.infer<typeof zUserSchema>;

const UserSchema = new Schema<IUser>(
  {
    accepted_eula: {
      type: Date,
    },
    uid: {
      type: String,
      // required: true, TODO: fix it
      // ! If you want to make it unique, user creation process needs to be updated
      // unique: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 25,
      toLowerCase: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      address: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      },
      verified: {
        type: Boolean,
        default: false,
      },
    },
    phone: {
      number: {
        type: String,
        trim: true,
      },
      verified: {
        type: Boolean,
        default: false,
      },
    },
    profileImage: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      default: UserRoleEnum.User,
      enum: Object.values(UserRoleEnum),
    },
    isPrivate: { type: Boolean, default: false },
    signupMethod: {
      type: String,
      required: true,
      enum: Object.values(SignupMethodEnum),
    },
    devices: {
      type: [userDeviceSchema],
      default: [],
    },
    progress: {
      type: userProgressSchema,
      default: {},
    },
    verified: {
      type: Boolean,
      default: false,
    },
    earnings: {
      total: { type: Number, default: 0 },
      balance: { type: Number, default: 0 },
    },
    latestPlace: {
      type: Schema.Types.ObjectId,
      ref: "Place",
    },
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    mundoInteractionFrequency: {
      type: Number,
      min: 0,
      max: 100,
    },
    stripe: {
      type: userStripeSchema,
      default: {},
    },
    appUsage: {
      type: userAppUsageSchema,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    source: {
      type: String,
      enum: ["yelp", "google"],
    },

    password: {
      type: String,
    },
  },
  { timestamps: true },
);

UserSchema.pre("validate", function (next) {
  if (this.signupMethod === SignupMethodEnum.Traditional && !this.password) {
    next(new Error("Password is required for traditional signup"));
  } else {
    next();
  }
});

// dependency removal function
async function removeDependencies(user: IUser) {
  //remove all achievements of the user
  const achievements = await Achievement.find({ userId: user._id });
  for (const achievement of achievements) {
    await achievement.deleteOne();
  }

  // remove all checkins of the user
  const checkins = await CheckIn.find({ user: user._id });
  await Promise.all(checkins.map((checkin) => checkin.deleteOne()));

  //remove all comments of that user
  const comments = await Comment.find({ author: user._id });
  await Promise.all(
    comments.map((comment) => DeletionService.deleteComment(comment._id)),
  );

  // remove all followings and followers of that user
  const follows = await Follow.find({
    $or: [{ user: user._id }, { target: user._id }],
  });
  await Promise.all(follows.map((follow) => follow.deleteOne()));

  // remove all flags created by that user
  const flags = await Flag.find({ user: user._id });
  await Promise.all(flags.map((flag) => flag.deleteOne()));

  // remove all lists created by that user
  const lists = await List.find({ owner: user._id });
  await Promise.all(lists.map((list) => list.deleteOne()));

  // remove the user from all the lists that he is a collaborator of
  await List.updateMany(
    { "collaborators.user": user._id },
    { $pull: { collaborators: { user: user._id } } },
  );

  // remove all media created by that user
  const media = await Media.find({ user: user._id });
  await Promise.all(media.map((medium) => medium.deleteOne()));

  // remove all reactions of that user
  const reactions = await Reaction.find({ user: user._id });
  await Promise.all(reactions.map((reaction) => reaction.deleteOne()));

  // remove all reviews of that user
  const reviews = await Review.find({ writer: user._id });
  await Promise.all(reviews.map((review) => review.deleteOne()));
}

UserSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      removeDependencies(this);
      next();
    } catch (error) {
      next(error as CallbackError);
    }
  },
);

UserSchema.pre("deleteOne", async function (next) {
  try {
    const user = await this.model.findOne(this.getQuery());
    if (user) {
      await removeDependencies(user);
    }
    next();
  } catch (error) {
    next(error as CallbackError);
  }
});

const User =
  (mongoose.models.User as Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);

export default User;
