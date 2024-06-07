import { type IUser } from "../../models/User.js";

const UserProjection = {
  public: {
    _id: true,
    name: true,
    profileImage: true,
    username: true,
    bio: true,
    verified: true,
    createdAt: true,
    isPrivate: true,
    progress: true,
  },

  essentials: {
    _id: true,
    name: true,
    profileImage: true,
    username: true,
    verified: true,
    createdAt: true,
    isPrivate: true,
    progress: {
      level: true,
      xp: true,
    },
  },

  private: {
    _id: true,
    name: true,
    email: true,
    profileImage: true,
    username: true,
    bio: true,
    role: true,
    verified: true,
    createdAt: true,
    isPrivate: true,
    progress: true,
    accepted_eula: true,
  },

  admin: {
    _id: true,
    name: true,
    email: true,
    profileImage: true,
    username: true,
    bio: true,
    role: true,
    verified: true,
    createdAt: true,
    isPrivate: true,
  },
};

// public key union
export type UserPublicKeys = keyof typeof UserProjection.public;
export type UserProjectionPublic = Pick<IUser, UserPublicKeys>;

// essential key union
export type UserEssentialsKeys = keyof typeof UserProjection.essentials;
export type UserProjectionEssentials = {
  [K in UserEssentialsKeys]: K extends "progress"
    ? Omit<IUser["progress"], "achievements">
    : IUser[K];
};

// private key union
export type UserPrivateKeys = keyof typeof UserProjection.private;
export type UserProjectionPrivate = Pick<IUser, UserPrivateKeys>;

export default UserProjection;
