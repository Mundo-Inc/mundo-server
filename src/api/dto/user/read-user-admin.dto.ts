type AdminReadUserDto = {
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
  createdAt: Date;
  xp?: number;
  level?: number;
  coins?: number;
};

type AdminReadUserProjection = {
  [Property in keyof AdminReadUserDto]?: boolean;
};

export const adminReadUserProjection: AdminReadUserProjection = {
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
  createdAt: true,
  xp: true,
  level: true,
  coins: true,
};
