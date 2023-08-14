import mongoose, { Schema, type Document } from "mongoose";

export enum UserRoleEnum {
  admin = "admin",
  user = "user",
}

export enum SignupMethodEnum {
  social = "social",
  traditional = "traditional",
}
export interface IUser extends Document {
  username: string;
  email: {
    address: string;
    verified: boolean;
  };
  role?: string;
  isActive?: boolean;
  name?: string;
  phone?: string;
  bio?: string;
  profileImage?: string;
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
  source?: "yelp" | "google";
  createdAt: Date;
  updatedAt: Date;
  verified?: boolean;
  coins?: number;
  latestPlace?: mongoose.Types.ObjectId;
}

const UserSchema = new Schema<IUser>(
  {
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
      default: null,
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
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
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

export default mongoose.models.User ||
  mongoose.model<IUser>("User", UserSchema);
