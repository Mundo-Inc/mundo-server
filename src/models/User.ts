import mongoose, { Schema, type Document, CallbackError } from "mongoose";
import Achievement, { IAchievement } from "./Achievement";
import ActivitySeen from "./ActivitySeen";
import CheckIn from "./CheckIn";
import Comment from "./Comment";
import Deal from "./Deal";
import Follow from "./Follow";
import Flag from "./Flag";
import List from "./List";
import Media from "./Media";
import Reaction from "./Reaction";
import Review from "./Review";

export enum UserRoleEnum {
  admin = "admin",
  user = "user",
}

export enum SignupMethodEnum {
  social = "social",
  traditional = "traditional",
  cloud = "cloud",
}
export interface IUser extends Document {
  uid: string;
  username: string;
  email: {
    address: string;
    verified: boolean;
  };
  role?: string;
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
    resetPasswordToken: String;
    resetPasswordTokenExpiry: Date;
  };
  xp?: number;
  level?: number;
  signupMethod: string;
  devices?: {
    token: string;
    platform: string;
  }[];
  progress: {
    level: number;
    xp: number;
    achievements: mongoose.Types.ObjectId[];
  };
  source?: "yelp" | "google";
  createdAt: Date;
  updatedAt: Date;
  verified?: boolean;
  coins: number;
  latestPlace?: mongoose.Types.ObjectId;
}

const UserSchema = new Schema<IUser>(
  {
    uid: {
      type: String,
      // required: true, TODO: fix it
      unique: true,
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
      maxlength: 20,
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
      default: UserRoleEnum.user,
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
    xp: {
      type: Number,
      default: 0,
      index: true,
    },
    level: {
      type: Number,
      default: 1,
      index: true,
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
          token: {
            type: String,
            required: true,
          },
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
    latestPlace: {
      type: Schema.Types.ObjectId,
      ref: "Place",
    },
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
  await Promise.all(comments.map((comment) => comment.deleteOne()));

  // remove all deals created by that user
  const deals = await Deal.find({ creator: user._id });
  await Promise.all(deals.map((deal) => deal.deleteOne()));

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

UserSchema.pre<IUser>(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      const user = this;
      removeDependencies(user);
      next();
    } catch (error) {
      next(error as CallbackError);
    }
  }
);

UserSchema.pre("deleteOne", async function (next) {
  try {
    const user = await this.model.findOne(this.getQuery());
    await removeDependencies(user);
    next();
  } catch (error) {
    next(error as CallbackError);
  }
});

export default mongoose.models.User ||
  mongoose.model<IUser>("User", UserSchema);
