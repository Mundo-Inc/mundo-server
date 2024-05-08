const UserProjection = {
  public: {
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
  },

  essentials: {
    _id: true,
    name: true,
    profileImage: true,
    username: true,
    verified: true,
    createdAt: true,
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
    followersCount: true,
    followingCount: true,
    reviewsCount: true,
    role: true,
    verified: true,
    coins: true,
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
    followersCount: true,
    followingCount: true,
    reviewsCount: true,
    role: true,
    verified: true,
    createdAt: true,
    coins: true,
  },
};

// public key union
export type UserPublicKeys = keyof typeof UserProjection.public;

// essential key union
export type UserEssentialsKeys = keyof typeof UserProjection.essentials;

// private key union
export type UserPrivateKeys = keyof typeof UserProjection.private;

export default UserProjection;
