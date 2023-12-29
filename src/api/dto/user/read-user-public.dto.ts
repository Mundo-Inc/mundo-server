export type PublicReadUserDto = {
  _id: string;
  name: string;
  profileImage: string;
  username: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  reviewsCount: number;
  verified: boolean;
  xp?: number;
  level?: number;
  coins?: number;
  progress: {
    xp: number;
    level: number;
    achievements: {
      userId: string;
      type: string;
    }[];
  };
};

export const publicReadUserProjection: {
  [Property in keyof PublicReadUserDto]?: boolean;
} = {
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
  progress: true,
};
