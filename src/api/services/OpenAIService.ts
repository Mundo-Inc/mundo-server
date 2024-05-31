import OpenAI from "openai";

import { env } from "../../env.js";
import { type IComment } from "../../models/Comment.js";
import User from "../../models/User.js";
import Review, { type IReview } from "../../models/Review.js";
import Place, { type IPlace } from "../../models/Place.js";
import CheckIn from "../../models/CheckIn.js";
import { ICheckIn } from "../../models/CheckIn.js";
import { ensureNonEmptyString } from "../../utilities/requireValue.js";
import { createError } from "../../utilities/errorHandlers.js";
import { StatusCodes } from "http-status-codes";
import { ResourcePrivacyEnum } from "../../models/UserActivity.js";

export class OpenAIService {
  private static instance: OpenAIService;
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

  public async makeACommentOnCheckIn(checkIn: ICheckIn) {
    if (checkIn.privacyType === ResourcePrivacyEnum.PRIVATE) {
      throw Error("Private resource");
    }

    const [user, place, mentions, checkInHistory, reviewHistory] =
      await Promise.all([
        User.findById(checkIn.user).orFail(Error("User not found")).lean(),
        Place.findById(checkIn.place).orFail(Error("Place not found")).lean(),
        checkIn.tags.length > 0
          ? User.find({ _id: { $in: checkIn.tags } })
              .select("name")
              .lean()
          : [],
        CheckIn.find({
          user: checkIn.user,
          createdAt: { $lt: checkIn.createdAt },
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate<{
            place: Pick<IPlace, "_id" | "name">;
          }>({
            path: "place",
            select: "name",
          })
          .populate<{
            tags: Pick<IPlace, "_id" | "name">[];
          }>({
            path: "tags",
            select: "name",
          })
          .lean(),
        Review.find({
          writer: checkIn.user,
          createdAt: { $lt: checkIn.createdAt },
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate<{
            place: Pick<IPlace, "_id" | "name">;
          }>({
            path: "place",
            select: "name",
          })
          .populate<{
            tags: Pick<IPlace, "_id" | "name">[];
          }>({
            path: "tags",
            select: "name",
          })
          .lean(),
      ]);

    const base = `You are a cool ghost with GenZ characteristics, the character of our app. You're given the new activity of the user along with their 5 recent activities. Leave a short, funny comment as a response. Feel free to tease or roast them humorously. The app is for GenZ users, and they won't be mad. Just return the comment, nothing more.`;

    const mentionsText =
      mentions.length > 0
        ? ` with ${mentions.map((mention) => mention.name).join(", ")}`
        : "";
    const captionText = checkIn.caption
      ? ` and captioned it "${checkIn.caption}"`
      : "";

    const activities = [
      ...checkInHistory.map((checkIn) => ({
        type: "check-in",
        title: "checked in to",
        content: checkIn.caption || "",
        mentions: checkIn.tags.map((tag) => tag.name).join(", "),
        place: checkIn.place.name,
        date: checkIn.createdAt,
      })),
      ...reviewHistory.map((review) => ({
        type: "review",
        title: "left a review at",
        content: review.content || "",
        mentions: null,
        place: review.place.name,
        date: review.createdAt,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5);

    const activityHistory =
      activities.length > 0
        ? "\nActivity history:\n" +
          activities
            .map((activity) => {
              if (activity.type === "check-in") {
                return `${formatDate(activity.date)}: Checked in to ${
                  activity.place
                }${activity.mentions ? ` with ${activity.mentions}` : ""}${
                  activity.content
                    ? ` and captioned it "${activity.content.trim()}"`
                    : ""
                }`;
              } else {
                return `${formatDate(activity.date)}: Left a review at ${
                  activity.place
                }${
                  activity.content ? ` saying "${activity.content.trim()}"` : ""
                }`;
              }
            })
            .join("\n")
        : "";

    const prompt = `User name: "${user.name}"\nCurrent activity:\n${formatDate(
      checkIn.createdAt
    )}: ${user.name} checked in to ${
      place.name
    }${mentionsText}${captionText}.${activityHistory}`;

    console.log(prompt);

    // const response = await this.openai.chat.completions.create({
    //   messages: [
    //     {
    //       role: "system",
    //       content: base,
    //     },
    //     {
    //       role: "assistant",
    //       content: `If you can't think of anything to say, respond with something like: 'Noice'.`,
    //     },
    //     {
    //       role: "assistant",
    //       content: `Your previous comment for ${user.name} was 'Noice' on May 11th.`,
    //     },
    //     {
    //       role: "user",
    //       content: prompt,
    //     },
    //   ],
    //   model: "gpt-4o",
    // });

    // return response.choices[0].message.content;
  }
}

export async function checkInTest(id: string) {
  const checkIn = await CheckIn.findById(id)
    .orFail(createError("Check-in not found", StatusCodes.NOT_FOUND))
    .lean();

  const result = await OpenAIService.getInstance().makeACommentOnCheckIn(
    checkIn
  );

  console.log(result);
}

function formatDate(date: Date): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const month = months[date.getMonth()];
  const day = date.getDate();
  const daySuffix = getOrdinalSuffix(day);
  const formattedDay = `${day}${daySuffix}`;

  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 || 12;

  return `${month} ${formattedDay}, ${formattedHours}:${minutes} ${period}`;
}

function getOrdinalSuffix(day: number): string {
  const j = day % 10,
    k = day % 100;
  if (j == 1 && k != 11) return "st";
  if (j == 2 && k != 12) return "nd";
  if (j == 3 && k != 13) return "rd";
  return "th";
}

// User name: "Nabeel 👻"
// Current activity:
// May 19th, 8:46 PM: Nabeel 👻 checked in to Voyager Craft Coffee.
// Activity history:
// May 17th, 9:49 PM: Nabeel 👻 checked in to Steady Eddy's with Joe Na and captioned it "Sketchy eddie at steady eddies 👀"
// May 17th, 9:37 PM: Nabeel 👻 checked in to Putah Creek Cafe with Joe Na, Zach and captioned it "Today’s the day! Congrats Max ! 🎉"
// May 17th, 6:38 AM: Nabeel 👻 checked in to Preserve Public House
// May 16th, 11:26 PM: Nabeel 👻 checked in to Green River Brewing  with Joe Na and captioned it "Da burrrrrrr 🍻"
// May 16th, 8:20 PM: Nabeel 👻 checked in to Dutch Bros Coffee

// {
//   messages: [
//     {
//       role: "system",
//       content:
//         "You are a cool ghost with GenZ characteristics which is the character of our app. You're going to be given the new activity of the users alongside their 5 recent activities and you should try to leave them a comment as a response. Make the comment short and fun, also don't be afraid to tease or roast them if needed. The app is for GenZ people and they won't be mad. Just return the comment, nothing more.",
//     },
//     {
//       role: "assistant",
//       content: `If you can't think of anything to say, Just respond with somethink like: "Noice"`,
//     },
//     {
//       role: "assistant",
//       content: 'Your previous comment for this user was "Noice" on May 11th',
//     },
//     {
//       role: "user",
//       content:
//         'User name: "Nabeel 👻"\n' +
//         "Current activity:\n" +
//         "May 19th, 8:46 PM: Nabeel 👻 checked in to Voyager Craft Coffee.\n" +
//         "Activity history:\n" +
//         `May 17th, 9:49 PM: Nabeel 👻 checked in to Steady Eddy's with Joe Na and captioned it "Sketchy eddie at steady eddies 👀"\n` +
//         'May 17th, 9:37 PM: Nabeel 👻 checked in to Putah Creek Cafe with Joe Na, Zach and captioned it "Today’s the day! Congrats Max ! 🎉"\n' +
//         "May 17th, 6:38 AM: Nabeel 👻 checked in to Preserve Public House\n" +
//         'May 16th, 11:26 PM: Nabeel 👻 checked in to Green River Brewing  with Joe Na and captioned it "Da burrrrrrr 🍻"\n' +
//         "May 16th, 8:20 PM: Nabeel 👻 checked in to Dutch Bros Coffee",
//     },
//   ];
// }
