import cron from "node-cron";
import User, { IUser } from "../models/User";
import Bot, { IBot, IBotTarget, IBotType } from "../models/Bot";
import logger from "../api/services/logger";
import UserActivity, {
  IUserActivity,
  ResourceTypeEnum,
} from "../models/UserActivity";
import Reaction from "../models/Reaction";

function getDateHoursAgo(hours: number) {
  var now = new Date();
  now.setHours(now.getHours() - hours);
  return now;
}

function pickRandomReaction(strings: String[]) {
  const randomIndex = Math.floor(Math.random() * strings.length);
  return strings[randomIndex];
}

User.find({ signupMethod: "bot" }).then(async (botUsers: IUser[]) => {
  for (const botUser of botUsers) {
    const duties = (await Bot.find({
      userId: botUser._id,
    })) as [IBot];
    for (const duty of duties) {
      //   logger.debug(duty);
      switch (duty.type) {
        case IBotType.REACT:
          interface Query {
            hasMedia?: boolean;
            resourceType?: ResourceTypeEnum;
            createdAt?: {
              $gt: Date;
            };
          }
          cron.schedule(duty.interval, async () => {
            try {
              let query: Query = {};
              if (duty.target === "CHECKINS")
                query.resourceType = ResourceTypeEnum.CHECKIN;
              if (duty.target === "REVIEWS")
                query.resourceType = ResourceTypeEnum.REVIEW;
              if (duty.target === IBotTarget.HAS_MEDIA) query.hasMedia = true;
              if (duty.targetThresholdHours)
                query.createdAt = {
                  $gt: getDateHoursAgo(duty.targetThresholdHours),
                };
              let userActivities = (await UserActivity.find(query)) as [
                IUserActivity
              ];
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
                    { $inc: { "engagements.reactions": 1 } }
                  );
                }
              }
            } catch (error) {
              logger.error("Error While Adding Reaction With Bot", error);
            }
          });
          break;

        default:
          break;
      }
    }
  }
});
