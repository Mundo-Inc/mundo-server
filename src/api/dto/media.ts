import { type IMedia } from "../../models/Media.js";

const MediaProjection = {
  brief: {
    _id: true,
    src: true,
    caption: true,
    type: true,
  },

  detail: {
    _id: true,
    src: true,
    caption: true,
    type: true,
    place: true,
    event: true,
    user: true,
  },
};

// brief key union
export type MediaBriefKeys = keyof typeof MediaProjection.brief;
export type MediaProjectionBrief = Pick<IMedia, MediaBriefKeys>;

// detail key union
export type MediaDetailKeys = keyof typeof MediaProjection.detail;
export type MediaProjectionDetail = Pick<IMedia, MediaDetailKeys>;

export default MediaProjection;
