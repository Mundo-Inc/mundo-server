import { Types } from "mongoose";
import Follow, { FollowStatusEnum } from "../models/Follow.js";
import FollowRequest from "../models/FollowRequest.js";

export type ConnectionStatus = {
  // deprecated

  /**
   * @deprecated use followedByStatus instead
   * Whether the target user follows the current user
   */
  followsUser: boolean;

  /**
   * @deprecated use followingStatus instead
   * Whether the current user follows the target user
   */
  followedByUser: boolean;

  /**
   * The status of the current user following the target user
   */
  followingStatus: FollowStatusEnum;

  /**
   * The status of the target user following the current user
   */
  followedByStatus: FollowStatusEnum;
};

export async function getConnectionStatus(
  authId: Types.ObjectId | string,
  targetId: Types.ObjectId | string,
) {
  const connectionStatus: ConnectionStatus = {
    followsUser: false,
    followedByUser: false,
    followingStatus: FollowStatusEnum.NotFollowing,
    followedByStatus: FollowStatusEnum.NotFollowing,
  };

  const userOID =
    typeof authId === "string" ? new Types.ObjectId(authId) : authId;
  const targetOID =
    typeof targetId === "string" ? new Types.ObjectId(targetId) : targetId;

  const [followDocs, requestDocs] = await Promise.all([
    Follow.find({
      $or: [
        { user: userOID, target: targetOID },
        { target: userOID, user: targetOID },
      ],
    })
      .lean()
      .limit(2),
    FollowRequest.find({
      $or: [
        { user: userOID, target: targetOID },
        { target: userOID, user: targetOID },
      ],
    })
      .lean()
      .limit(2),
  ]);

  requestDocs.forEach((doc) => {
    if (userOID.equals(doc.user)) {
      connectionStatus.followingStatus = FollowStatusEnum.Requested;
    } else if (userOID.equals(doc.target)) {
      connectionStatus.followedByStatus = FollowStatusEnum.Requested;
    }
  });

  followDocs.forEach((doc) => {
    if (userOID.equals(doc.user)) {
      connectionStatus.followedByUser = true;
      connectionStatus.followingStatus = FollowStatusEnum.Following;
    } else if (userOID.equals(doc.target)) {
      connectionStatus.followsUser = true;
      connectionStatus.followedByStatus = FollowStatusEnum.Following;
    }
  });

  return connectionStatus;
}

export async function getConnectionStatuses(
  authId: Types.ObjectId,
  targetIds: (Types.ObjectId | string)[],
) {
  const connectionStatuses: Record<string, ConnectionStatus> = {};

  for (const _targetId of targetIds) {
    const targetId =
      typeof _targetId === "string" ? new Types.ObjectId(_targetId) : _targetId;
    const stringTargetId =
      typeof _targetId === "string" ? _targetId : _targetId.toString();
    if (!connectionStatuses[stringTargetId] && !targetId.equals(authId)) {
      connectionStatuses[stringTargetId] = {
        followsUser: false,
        followedByUser: false,
        followingStatus: FollowStatusEnum.NotFollowing,
        followedByStatus: FollowStatusEnum.NotFollowing,
      };
    }
  }

  const uniqueTargetIds = Object.keys(connectionStatuses).map(
    (id) => new Types.ObjectId(id),
  );

  const [followDocs, requestDocs] = await Promise.all([
    Follow.find({
      $or: [
        {
          user: authId,
          target: uniqueTargetIds,
        },
        {
          target: authId,
          user: uniqueTargetIds,
        },
      ],
    })
      .select({
        target: 1,
        user: 1,
      })
      .lean(),
    FollowRequest.find({
      $or: [
        {
          user: authId,
          target: uniqueTargetIds,
        },
        {
          target: authId,
          user: uniqueTargetIds,
        },
      ],
    })
      .select({
        target: 1,
        user: 1,
      })
      .lean(),
  ]);

  requestDocs.forEach((doc) => {
    const userId = doc.user.toString();
    const targetId = doc.target.toString();
    if (authId.equals(userId)) {
      connectionStatuses[targetId].followingStatus = FollowStatusEnum.Requested;
    } else {
      connectionStatuses[userId].followedByStatus = FollowStatusEnum.Requested;
    }
  });

  followDocs.forEach((f) => {
    const userId = f.user.toString();
    const targetId = f.target.toString();
    if (authId.equals(userId)) {
      // Current user follows the target
      connectionStatuses[targetId].followedByUser = true;
      connectionStatuses[targetId].followingStatus = FollowStatusEnum.Following;
    } else {
      // Target follows the current user
      connectionStatuses[userId].followsUser = true;
      connectionStatuses[userId].followedByStatus = FollowStatusEnum.Following;
    }
  });

  return connectionStatuses;
}
