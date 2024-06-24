import mongoose, { Schema, type CallbackError, type Model } from "mongoose";

import DeletionService from "../api/services/DeletionService.js";
import Achievement from "./Achievement.js";
import ActivitySeen from "./ActivitySeen.js";
import CheckIn from "./CheckIn.js";
import Comment from "./Comment.js";
import Flag from "./Flag.js";
import Follow from "./Follow.js";
import List from "./List.js";
import Media from "./Media.js";
import Reaction from "./Reaction.js";
import Review from "./Review.js";

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

export type UserDevice = {
  apnToken?: string;
  fcmToken?: string;
  platform: string;
};

export interface IDailyReward {
  streak: number;
  lastClaim?: Date;
}

const dailyRewardSchema = new Schema<IDailyReward>(
  {
    streak: {
      type: Number,
      default: 0,
    },
    lastClaim: {
      type: Date,
      required: false,
    },
  },
  { _id: false }
);

export interface IUser {
  _id: mongoose.Types.ObjectId;
  accepted_eula: Date;
  uid: string;
  username: string;
  email: {
    address: string;
    verified: boolean;
  };
  role: UserRoleEnum;
  isActive?: boolean;
  name: string;
  phone?: string;
  bio: string;
  profileImage: string;
  password: string;
  token?: {
    verificationToken: string;
    lastEmailSent: Date;
    emailTokenExpiry: Date;
    resetPasswordToken?: String;
    resetPasswordTokenExpiry?: Date;
  };
  signupMethod: string;
  devices: UserDevice[];
  progress: {
    level: number;
    xp: number;
    achievements: mongoose.Types.ObjectId[];
  };
  decorations: {
    cover?: string;
    frame?: string;
  };
  source?: "yelp" | "google";
  createdAt: Date;
  updatedAt: Date;
  verified?: boolean;
  coins: number;
  phantomCoins: {
    balance: number;
    daily: IDailyReward;
  };
  latestPlace?: mongoose.Types.ObjectId;
  isPrivate: boolean;
  conversations: string[];
  referredBy?: mongoose.Types.ObjectId;
  stripe: {
    /**
     * Stripe Connect Account ID
     */
    connectAccountId?: string;
    /**
     * Stripe Customer ID
     */
    customerId?: string;
    /**
     * Default Stripe Payment Method ID
     */
    defaultPaymentMethodId?: string;
    /**
     * Default Stripe Payout Method ID
     */
    defaultPayoutMethodId?: string;
    /**
     * User's balance in cents
     */
    balance: number;
  };
  mundoInteractionFrequency?: number;
}

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
    name: {
      type: String,
      trim: true,
      default: "",
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
    role: {
      type: String,
      default: UserRoleEnum.User,
      enum: Object.values(UserRoleEnum),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    phone: {
      type: String,
      trim: true,
      // default: null,
      // unique: true,
    },
    bio: {
      type: String,
      trim: true,
      default: "",
    },
    profileImage: {
      type: String,
      default: "",
    },
    signupMethod: {
      type: String,
      required: true,
      enum: Object.values(SignupMethodEnum),
    },
    source: {
      type: String,
      enum: ["yelp", "google"],
    },
    password: {
      type: String,
    },
    devices: {
      type: [
        {
          apnToken: String,
          fcmToken: String,
          platform: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },
    token: {
      verificationToken: {
        type: String,
      },
      lastEmailSent: {
        type: Date,
      },
      emailTokenExpiry: {
        type: Date,
      },
      resetPasswordToken: {
        type: String,
      },
      resetPasswordTokenExpiry: {
        type: Date,
      },
    },
    verified: {
      type: Boolean,
      default: false,
    },
    coins: {
      type: Number,
      default: 0,
    },
    phantomCoins: {
      balance: {
        type: Number,
        default: 0,
      },
      daily: {
        type: dailyRewardSchema,
        default: {
          streak: 0,
        },
      },
    },
    latestPlace: {
      type: Schema.Types.ObjectId,
      ref: "Place",
    },
    conversations: [
      {
        type: String,
        ref: "Conversation",
        default: [],
      },
    ],
    progress: {
      xp: {
        type: Number,
        default: 0,
      },
      level: {
        type: Number,
        default: 1,
      },
      achievements: [
        {
          type: Schema.Types.ObjectId,
          ref: "Achievement",
          default: [],
        },
      ],
    },
    decorations: {
      cover: {
        type: String,
      },
      frame: {
        type: String,
      },
    },
    isPrivate: { type: Boolean, default: false },
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    stripe: {
      connectAccountId: { type: String },
      customerId: { type: String },
      defaultPaymentMethodId: { type: String },
      defaultPayoutMethodId: { type: String },
      balance: { type: Number, required: true, default: 0 },
    },
    mundoInteractionFrequency: {
      type: Number,
      min: 0,
      max: 100,
    },
  },
  { timestamps: true }
);

UserSchema.pre("validate", function (next) {
  if (this.signupMethod === "traditional" && !this.password) {
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

  //remove activitySeen of the user
  const activitiesSeen = await ActivitySeen.find({
    $or: [{ observerId: user._id }, { subjectId: user._id }],
  });
  await Promise.all(
    activitiesSeen.map((activitySeen) => activitySeen.deleteOne())
  );

  // remove all checkins of the user
  const checkins = await CheckIn.find({ user: user._id });
  await Promise.all(checkins.map((checkin) => checkin.deleteOne()));

  //remove all comments of that user
  const comments = await Comment.find({ author: user._id });
  await Promise.all(
    comments.map((comment) => DeletionService.deleteComment(comment._id))
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
    { $pull: { collaborators: { user: user._id } } }
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
  }
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
