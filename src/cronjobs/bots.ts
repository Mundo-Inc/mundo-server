import cron, { type ScheduledTask } from "node-cron";

import logger from "../api/services/logger/index.js";
import Bot, { IBotTargetEnum, IBotTypeEnum, type IBot } from "../models/Bot.js";
import { ResourceTypeEnum } from "../models/enum/resourceTypeEnum.js";
import Reaction from "../models/Reaction.js";
import User, { type IUser } from "../models/user/user.js";
import UserActivity, {
  type UserActivityResourceType,
} from "../models/UserActivity.js";

function getDateHoursAgo(hours: number) {
  let now = new Date();
  now.setHours(now.getHours() - hours);
  return now;
}

function pickRandomReaction(strings: String[]) {
  const randomIndex = Math.floor(Math.random() * strings.length);
  return strings[randomIndex];
}

// Define a type for the tasks object
interface TaskCollection {
  [key: string]: ScheduledTask;
}

// Create an object to store the tasks
let tasks: TaskCollection = {};

export function createCron(id: string, duty: IBot, botUser: IUser) {
  switch (duty.type) {
    case IBotTypeEnum.React:
      interface Query {
        hasMedia?: boolean;
        resourceType?: UserActivityResourceType;
        createdAt?: {
          $gt: Date;
        };
      }
      tasks[id] = cron.schedule(duty.interval, async () => {
        try {
          let query: Query = {};
          if (duty.target === "CHECKINS")
            query.resourceType = ResourceTypeEnum.CheckIn;
          if (duty.target === "REVIEWS")
            query.resourceType = ResourceTypeEnum.Review;
          if (duty.target === IBotTargetEnum.HasMedia) query.hasMedia = true;
          if (duty.targetThresholdHours)
            query.createdAt = {
              $gt: getDateHoursAgo(duty.targetThresholdHours),
            };
          const userActivities = await UserActivity.find(query);
          for (const userActivity of userActivities) {
            // check if we already reacted or not!
            const alreadyReacted = await Reaction.findOne({
              user: botUser._id,
              target: userActivity._id,
            });

            if (
              !alreadyReacted &&
              duty.reactions &&
              duty.reactions.length > 0
            ) {
              // pick a random reaction from the reactions in duty and react!
              const reaction = pickRandomReaction(duty.reactions);
              await Reaction.create({
                user: botUser._id,
                target: userActivity._id,
                type: "emoji",
                reaction,
              });
              // update reaction count in user activity
              await UserActivity.updateOne(
                { _id: userActivity._id },
                { $inc: { "engagements.reactions": 1 } },
              );
            }
          }
        } catch (error) {
          logger.error("Error While Adding Reaction With Bot", error);
        }
      });
      logger.verbose("BOT: " + botUser._id + " is on | " + botUser.name);
      return tasks[id];

    default:
      break;
  }
}

User.find({ signupMethod: "bot" }).then(async (botUsers: IUser[]) => {
  for (const botUser of botUsers) {
    const duties = await Bot.find({
      userId: botUser._id,
    });
    for (const duty of duties) {
      createCron(duty._id.toString(), duty, botUser)?.start();
    }
  }
});
