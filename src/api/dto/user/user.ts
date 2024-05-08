const UserProjection = {
  public: {
    _id: true,
    name: true,
    profileImage: true,
    username: true,
    bio: true,
    verified: true,
    progress: true,
    isPrivate: true,
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
    role: true,
    verified: true,
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
  },
};

// public key union
export type UserPublicKeys = keyof typeof UserProjection.public;

// essential key union
export type UserEssentialsKeys = keyof typeof UserProjection.essentials;

// private key union
export type UserPrivateKeys = keyof typeof UserProjection.private;

export default UserProjection;
