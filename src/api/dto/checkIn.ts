import { type ICheckIn } from "../../models/CheckIn.js";
import { type MediaProjectionBrief } from "./media.js";
import { type PlaceProjectionDetail } from "./place.js";
import { type UserProjectionEssentials } from "./user.js";

const CheckInProjection = {
  brief: {
    _id: true,
    caption: true,
    tags: true,
    privacyType: true,
    createdAt: true,
    updatedAt: true,
    user: true,
    place: true,
    media: true,
  },
};

type CheckInBriefOverridden = Omit<ICheckIn, "user" | "place" | "media"> & {
  user: UserProjectionEssentials;
  place: PlaceProjectionDetail;
  media: Array<MediaProjectionBrief>;
};

// brief key union
type CheckInBriefKeys = keyof typeof CheckInProjection.brief;
export type CheckInProjectionBrief = Pick<
  CheckInBriefOverridden,
  CheckInBriefKeys
>;

export default CheckInProjection;
