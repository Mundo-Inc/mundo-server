import axios from "axios";

import { env } from "../../env.js";

export const slackChannels = {
  devAssistant: env.SLACK_WEBHOOK_URL_DEV_ASSISTANT,
  phantomAssistant: env.SLACK_WEBHOOK_URL_PHANTOM_ASSISTANT,
};

export async function sendSlackMessage(
  channel: keyof typeof slackChannels,
  message: string,
  image?: string,
  sendInDevEnvironment: boolean = false,
) {
  let prefix = "";
  if (env.NODE_ENV !== "production") {
    if (!sendInDevEnvironment) {
      return;
    }

    channel = "devAssistant";
    prefix = ":technologist: From local dev environment\n\n";
  }

  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: prefix + message,
      },
    },
  ];

  if (image) {
    blocks.push({
      type: "image",
      image_url: image,
      alt_text: "image",
    });
  }

  await axios.post(slackChannels[channel], {
    blocks: blocks,
  });
}
