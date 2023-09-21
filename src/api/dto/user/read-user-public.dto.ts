export type PublicReadUserDto = {
  _id: string;
  name: string;
  profileImage?: string | null;
  username: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  reviewsCount: number;
  verified?: boolean;
  xp?: number;
  level?: number;
  coins?: number;
};

type PublicReadUserProjection = {
  [Property in keyof PublicReadUserDto]?: boolean | 0 | 1;
};

export const publicReadUserProjection: PublicReadUserProjection = {
  _id: true,
  name: true,
  profileImage: true,
  username: true,
  bio: true,
  followersCount: true,
  followingCount: true,
  reviewsCount: true,
  verified: true,
  xp: true,
  level: true,
  coins: true,
};

// For aggregate
export const publicReadUserProjectionAG: PublicReadUserProjection = {
  _id: 1,
  name: 1,
  profileImage: 1,
  username: 1,
  bio: 1,
  followersCount: 1,
  followingCount: 1,
  reviewsCount: 1,
  verified: 1,
  xp: 1,
  level: 1,
  coins: 1,
};
