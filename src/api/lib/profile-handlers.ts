import crypto from "crypto";
import User, { SignupMethodEnum, UserRoleEnum } from "../../models/User";
import { createError } from "../../utilities/errorHandlers";

export const handleSignUp = async (
  email: string,
  name: string,
  username: string,
  signupMethod: SignupMethodEnum,
  password: string | null,
  uid?: string,
  profileImage?: string
) => {
  let user = await User.findOne({
    "email.address": email.toLowerCase(),
  });
  if (user) {
    throw createError("User already exists", 409);
  }
  user = await User.create({
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
  });
  if (uid) {
    user.uid = uid;
  } else {
    user.uid = user._id.toString();
  }
  if (profileImage) {
    user.profileImage = profileImage;
  }
  await user.save();
  return user;
};
