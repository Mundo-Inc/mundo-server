import crypto from "crypto";
import { StatusCodes } from "http-status-codes";

import User, { SignupMethodEnum, UserRoleEnum } from "../../models/User.js";
import { createError } from "../../utilities/errorHandlers.js";

export const handleSignUp = async (
  email: string,
  name: string,
  username: string,
  signupMethod: SignupMethodEnum,
  password: string | null,
  uid?: string,
  profileImage?: string
) => {
  const exists = await User.exists({ "email.address": email.toLowerCase() });

  if (exists) {
    throw createError("User already exists", StatusCodes.CONFLICT);
  }

  const user = new User({
    name,
    username: username || Math.random().toString(36).substring(2, 15),
    email: {
      address: email,
      verified: false,
    },
    role: UserRoleEnum.user,
    signupMethod,
    password: password || null,
    verificationToken: crypto.randomBytes(20).toString("hex"),
    profileImage: profileImage || "",
  });

  if (uid) {
    user.uid = uid;
  } else {
    user.uid = user._id.toString();
  }

  await user.save();

  return user;
};
