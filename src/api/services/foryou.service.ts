import UserActivity from "../../models/UserActivity";

export const getForYouFeed = async (
    userId: string,
    page: number = 1,
    limit: number = 5,
    location?: {
        lng: number;
        lat: number;
    }
) => {
    // const result = await UserActivity.find({ hasMedia: true }).sort({ hotnessScore: -1 }).limit(limit).skip((page - 1) * limit).populate("resourceId placeId")
    const aggregate = await UserActivity.aggregate([
        {
            $match: {
                hasMedia: true
            }
        },
        {
            $sort: {
                hotnessScore: -1
            }
        },
        {
            $skip: (page - 1) * limit
        },
        {
            $limit: limit
        },
        {
            $lookup: {
                from: "reactions",
                localField: "_id",
                foreignField: "target",
                as: "reactions"
            }
        },
        {
            $lookup: {
                from: "comments",
                localField: "_id",
                foreignField: "userActivity",
                as: "comments"
            }
        }
    ]).exec()
    const result = await UserActivity.populate(aggregate, [
        { path: "resourceId" },
        { path: "placeId" }
    ]);

    return result;
}