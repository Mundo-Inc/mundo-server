export type UserCompactDto = {
  _id: string;
  name: string;
  profileImage: string;
  username: string;
  verified: boolean;
  progress: {
    level: number;
  };
};

export const readUserCompactProjection: {
  [Property in keyof UserCompactDto]?: boolean | Object;
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
