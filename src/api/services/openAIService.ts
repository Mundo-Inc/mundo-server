import { type Types } from "mongoose";
import OpenAI from "openai";
import tz_lookup from "tz-lookup";

import { env } from "../../env.js";
import CheckIn, { type ICheckIn } from "../../models/checkIn.js";
import Comment, { type IComment } from "../../models/comment.js";
import Place, { type IPlace } from "../../models/place.js";
import Review, { type IReview } from "../../models/review.js";
import User, { type IUser } from "../../models/user/user.js";
import UserActivity, {
  ResourcePrivacyEnum,
} from "../../models/userActivity.js";
import { trimQuotes } from "../../utilities/stringHelper.js";

export class OpenAIService {
  private static instance: OpenAIService;
  private static base = `You are a cool ghost named Mundo with GenZ characteristics, the character of our app. You're given the new activity of the user along with their 3 recent activities. Leave a short, funny comment as a response. Feel free to tease or roast them humorously. Just return the comment or "-", nothing more.`;
  private static replyBase = `You are a cool ghost named Mundo with GenZ characteristics, the character of our app. You're given the new activity of the user along with their recent activity and their reply to your previous comment. Leave a short, funny comment in response to their reply. Feel free to tease or roast them humorously. Just return the comment or "-", nothing more.`;

  private openai: OpenAI;

  private constructor() {
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  public static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }
    return OpenAIService.instance;
  }

  public async makeACommentOnReview(review: IReview) {
    const [user, place, activityHistory] = await Promise.all([
      User.findById(review.writer).orFail(new Error("User not found")).lean(),
      Place.findById(review.place).orFail(new Error("Place not found")).lean(),
      this.getActivityHistory(review.writer, review.createdAt, 3),
    ]);

    const prompt = `Name: "${user.name}"\nCurrent activity:\n${getReviewText(
      review,
      place,
    )}\n${activityHistory}`;

    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: OpenAIService.base,
        },
        {
          role: "system",
          content: `If you think it's better to not say anything, just respond with "-".`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "gpt-4o",
    });

    return this.trimResponse(response.choices[0].message.content);
  }

  public async makeACommentOnCheckIn(checkIn: ICheckIn) {
    if (checkIn.privacyType === ResourcePrivacyEnum.Private) {
      throw new Error("Private resource");
    }

    const [user, place, mentions, activityHistory] = await Promise.all([
      User.findById(checkIn.user).orFail(new Error("User not found")).lean(),
      Place.findById(checkIn.place).orFail(new Error("Place not found")).lean(),
      checkIn.tags.length > 0
        ? User.find({ _id: { $in: checkIn.tags } })
            .select<Pick<IUser, "name">>("name")
            .lean()
        : [],
      this.getActivityHistory(checkIn.user, checkIn.createdAt),
    ]);

    const prompt = `Name: "${user.name}"\nCurrent activity:\n${getCheckInText(
      checkIn,
      mentions,
      place,
    )}\n${activityHistory}`;

    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: OpenAIService.base,
        },
        {
          role: "system",
          content: `If you think it's better to not say anything, just respond with "-".`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "gpt-4o",
    });

    return this.trimResponse(response.choices[0].message.content);
  }

  public async replyToComment(comment: IComment) {
    const [parentComment, author, userActivity, activityHistory] =
      await Promise.all([
        Comment.findById(comment.parent)
          .orFail(new Error("Parent comment not found"))
          .lean(),
        User.findById(comment.author)
          .orFail(new Error("User not found"))
          .lean(),
        UserActivity.findById(comment.userActivity)
          .orFail(new Error("User activity not found"))
          .populate<{
            placeId: Pick<IPlace, "_id" | "name" | "location">;
          }>({
            path: "placeId",
            select: "name location",
          })
          .lean(),
        this.getActivityHistory(comment.author, undefined, 1),
      ]);

    const prompt = `Name: "${author.name}"\n${getDateTime(
      comment.createdAt,
      userActivity.placeId.location.geoLocation.coordinates[1],
      userActivity.placeId.location.geoLocation.coordinates[0],
    )} Responded to your reply with: ${comment.content}.\n${getDateTime(
      parentComment.createdAt,
      userActivity.placeId.location.geoLocation.coordinates[1],
      userActivity.placeId.location.geoLocation.coordinates[0],
    )} Your previous comment: ${parentComment.content}\n${activityHistory}`;

    const response = await this.openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: OpenAIService.replyBase,
        },
        {
          role: "system",
          content: `Don't push the conversation. So if they respond with a short reply or if you think this should be the end of conversation just respond with "-"`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "gpt-4o",
    });

    return this.trimResponse(response.choices[0].message.content);
  }

  private async getActivityHistory(
    user: Types.ObjectId,
    createdAt?: Date,
    limit: number = 3,
  ) {
    const [checkInHistory, reviewHistory] = await Promise.all([
      CheckIn.find({
        user,
        ...(createdAt && { createdAt: { $lt: createdAt } }),
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select<Pick<ICheckIn, "createdAt" | "caption" | "tags" | "place">>(
          "createdAt caption tags place",
        )
        .populate<{
          place: Pick<IPlace, "_id" | "name" | "location">;
        }>({
          path: "place",
          select: "name location",
        })
        .populate<{
          tags: Pick<IPlace, "_id" | "name">[];
        }>({
          path: "tags",
          select: "name",
        })
        .lean(),
      Review.find({
        writer: user,
        ...(createdAt && { createdAt: { $lt: createdAt } }),
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select<Pick<IReview, "createdAt" | "content" | "place">>(
          "createdAt content place",
        )
        .populate<{
          place: Pick<IPlace, "_id" | "name" | "location">;
        }>({
          path: "place",
          select: "name location",
        })
        .lean(),
    ]);

    const activities = [
      ...checkInHistory.map((checkIn) => ({
        type: "check-in",
        text: getCheckInText(checkIn, checkIn.tags, checkIn.place),
        date: checkIn.createdAt,
      })),
      ...reviewHistory.map((review) => ({
        type: "review",
        text: getReviewText(review, review.place),
        date: review.createdAt,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);

    return activities.length > 0
      ? "\nActivity history:\n" +
          activities.map((activity) => activity.text).join("\n")
      : "";
  }

  private trimResponse(response: string | null) {
    if (!response?.length) return null;

    const trimmedResponse = trimQuotes(response);
    return trimmedResponse === "-" ? null : trimmedResponse;
  }
}

function getDateTime(date: Date, lat: number, lng: number) {
  const tz = tz_lookup(lat, lng);

  return date.toLocaleString("en-US", {
    timeZone: tz,
    hour12: true,
    hour: "2-digit",
    minute: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function getCheckInText(
  checkIn: Pick<ICheckIn, "createdAt" | "caption">,
  tags: {
    name: string;
  }[],
  place: Pick<IPlace, "_id" | "name" | "location">,
) {
  const mentionsText =
    tags.length > 0
      ? ` with ${tags.map((mention) => mention.name).join(", ")}`
      : "";
  const captionText = checkIn.caption
    ? ` and captioned it "${checkIn.caption}"`
    : "";

  const tz = tz_lookup(
    place.location.geoLocation.coordinates[1],
    place.location.geoLocation.coordinates[0],
  );

  const dateTimeString = checkIn.createdAt.toLocaleString("en-US", {
    timeZone: tz,
    hour12: true,
    hour: "2-digit",
    minute: "numeric",
    month: "short",
    day: "2-digit",
  });

  return `${dateTimeString}: Checked in at ${place.name}${mentionsText}${captionText}`;
}

function getReviewText(
  review: Pick<IReview, "createdAt" | "content">,
  place: Pick<IPlace, "_id" | "name" | "location">,
) {
  const tz = tz_lookup(
    place.location.geoLocation.coordinates[1],
    place.location.geoLocation.coordinates[0],
  );

  const dateTimeString = review.createdAt.toLocaleString("en-US", {
    timeZone: tz,
    hour12: true,
    hour: "2-digit",
    minute: "numeric",
    month: "short",
    day: "2-digit",
  });

  return `${dateTimeString}: Reviewed ${place.name}${
    review.content ? ` saying "${review.content.trim()}"` : ""
  }`;
}
