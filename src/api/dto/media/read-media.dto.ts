export type ReadMediaDto = {
  _id: string;
  src: string;
  caption: string;
  place: string;
  user: string;
  type: string;
};

type ReadMediaProjection = {
  [Property in keyof ReadMediaDto]?: boolean;
};

export const readMediaProjection: ReadMediaProjection = {
  _id: true,
  src: true,
  caption: true,
  place: true,
  user: true,
  type: true,
};
