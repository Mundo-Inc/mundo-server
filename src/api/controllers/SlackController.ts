import axios from "axios";

export const slackChannels = {
  devAssistant: process.env.SLACK_WEBHOOK_URL_DEV_ASSISTANT!,
  phantomAssistant: process.env.SLACK_WEBHOOK_URL_PHANTOM_ASSISTANT!,
};

export async function sendSlackMessage(
  channel: keyof typeof slackChannels,
  message: string,
  image?: string
) {
  let prefix = "";
  if (process.env.MODE === "development") {
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

  try {
    await axios.post(slackChannels[channel], {
      blocks: blocks,
    });
  } catch {
    console.log("Failed to send slack message");
  }
}
