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
  progress: true,
};

export const publicReadUserEssentialProjection: {
  [Property in keyof PublicReadUserDto]?: any;
} = {
  _id: true,
  name: true,
  profileImage: true,
  username: true,
  verified: true,
  progress: {
    level: true,
  },
};
