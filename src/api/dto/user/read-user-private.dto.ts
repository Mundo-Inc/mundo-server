import mongoose from "mongoose";

export type PrivateReadUserDto = {
  _id: string;
  name: string;
  email: { address: string; verified: boolean };
  profileImage?: string | null;
  username: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  reviewsCount: number;
  role: string;
  verified: boolean;
  xp?: number;
  level?: number;
  coins?: number;
  progress?: {
    level: number;
    xp: number;
    achievements: mongoose.Types.ObjectId[];
  };
  accepted_eula?: Date;
};

type PrivateReadUserProjection = {
  [Property in keyof PrivateReadUserDto]?: boolean;
};

export const privateReadUserProjection: PrivateReadUserProjection = {
  _id: true,
  name: true,
  email: true,
  profileImage: true,
  username: true,
  bio: true,
  followersCount: true,
  followingCount: true,
  reviewsCount: true,
  role: true,
  verified: true,
  xp: true,
  level: true,
  coins: true,
  progress: true,
  accepted_eula: true,
};
