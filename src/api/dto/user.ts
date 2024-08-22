import { z } from "zod";

import { zUserSchema, type IUser } from "../../models/user/user.js";
import { zUserProgressSchema } from "../../models/user/userProgress.js";

export const UserProjection = {
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
    phone: true,
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
} satisfies Record<string, Partial<Record<keyof IUser, any>>>;

const UserProjectionKeys = {
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
    progress: true,
  },

  private: {
    _id: true,
    name: true,
    email: true,
    phone: true,
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
} satisfies Record<string, Partial<Record<keyof IUser, true | undefined>>>;

export const UserProjectionSchema = {
  public: zUserSchema.pick(UserProjectionKeys.public),
  essentials: zUserSchema
    .pick(UserProjectionKeys.essentials)
    .extend({ progress: zUserProgressSchema.omit({ achievements: true }) }),
  private: zUserSchema.pick(UserProjectionKeys.private),
  admin: zUserSchema.pick(UserProjectionKeys.admin),
};

export type UserProjectionType = {
  public: z.infer<typeof UserProjectionSchema.public>;
  essentials: z.infer<typeof UserProjectionSchema.essentials>;
  private: z.infer<typeof UserProjectionSchema.private>;
  admin: z.infer<typeof UserProjectionSchema.admin>;
};
