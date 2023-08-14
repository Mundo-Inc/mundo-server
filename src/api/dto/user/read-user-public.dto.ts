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
  [Property in keyof PublicReadUserDto]?: boolean;
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
