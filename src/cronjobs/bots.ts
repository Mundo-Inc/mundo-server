import cron, { type ScheduledTask } from "node-cron";

import type { RootFilterQuery } from "mongoose";
import logger from "../api/services/logger/index.js";
import Bot, { IBotTargetEnum, IBotTypeEnum, type IBot } from "../models/bot.js";
import { ResourceTypeEnum } from "../models/enum/resourceTypeEnum.js";
import Reaction from "../models/reaction.js";
import User, { type IUser } from "../models/user/user.js";
import UserActivity, { type IUserActivity } from "../models/userActivity.js";

function getDateHoursAgo(hours: number) {
  const now = new Date();
  now.setHours(now.getHours() - hours);
  return now;
}

function pickRandomReaction(strings: string[]) {
  const randomIndex = Math.floor(Math.random() * strings.length);
  return strings[randomIndex];
}

// Create an object to store the tasks
const tasks: Record<string, ScheduledTask> = {};

export function createCron(
  id: string,
  duty: IBot,
  botUser: Pick<IUser, "_id" | "name">,
) {
  switch (duty.type) {
    case IBotTypeEnum.React:
      tasks[id] = cron.schedule(duty.interval, async () => {
        try {
          const query: RootFilterQuery<IUserActivity> = {};
          if (duty.target === IBotTargetEnum.CheckIns)
            query.resourceType = ResourceTypeEnum.CheckIn;
          if (duty.target === IBotTargetEnum.Reviews)
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

      return tasks[id];

    default:
      break;
  }
}

User.find({ signupMethod: "bot" })
  .select<Pick<IUser, "_id" | "name">>({ _id: 1, name: 1 })
  .lean()
  .then(async (botUsers) => {
    for (const botUser of botUsers) {
      const duties = await Bot.find({
        userId: botUser._id,
      });
      for (const duty of duties) {
        createCron(duty._id.toString(), duty, botUser)?.start();
      }
    }

    logger.verbose(`${Object.keys(tasks).length} bot tasks started`);
  });
