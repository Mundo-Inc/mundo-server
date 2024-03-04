import { StatusCodes } from "http-status-codes";
import OpenAI from "openai";

import { createError } from "./errorHandlers";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function openAiAnalyzeReview(
  text: string,
  options?: {
    rewrite?: boolean;
  }
): Promise<{
  error: boolean | string;
  response: any;
  rewrite?: string;
  scores?: {
    drinkQuality?: number;
    foodQuality?: number;
  };
  tags?: string[];
  tokensUsed: number;
}> {
  if (!options) {
    options = {
      rewrite: false,
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an assistant that reads reviews of different places and extracts review's sentiment. For each review, suggest some hashtags that best describe the review.`,
        },
        {
          role: "system",
          content: `Response format: #A, #B, #C, #D`,
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    let tokensUsed = 0;
    if (response.usage?.total_tokens) {
      tokensUsed = response.usage?.total_tokens!;
    }

    let rewrite = "";
    if (options.rewrite) {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `Act as an assistant and rewrite the following review in a more concise way${
              text.length > 150 ? " and make it shorter" : ""
            }. Don't give any unnecessary information.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
      });
      rewrite = response.choices[0]?.message?.content!;
      if (response.usage?.total_tokens) {
        tokensUsed += response.usage?.total_tokens;
      }
    }

    try {
      if (!response.choices) {
        throw createError("parseError", StatusCodes.INTERNAL_SERVER_ERROR);
      }

      const responseText = response.choices[0].message?.content!;

      const hashtags = extractHashtags(responseText);

      return {
        error: false,
        response: response,
        rewrite: rewrite,
        tags: hashtags,
        tokensUsed,
      };
    } catch (error: any) {
      return {
        error: error.message || "rateLimit",
        rewrite: rewrite,
        response: response,
        tokensUsed,
      };
    }
  } catch (error: any) {
    return {
      error: "rateLimit",
      response: error,
      tokensUsed: 0,
    };
  }
}

export function extractHashtags(responseText: string) {
  const hashtags = responseText
    .match(/#[a-zA-Z0-9_]+/g)
    ?.map((h) => h.replace("#", ""));

  if (hashtags === null || !Array.isArray(hashtags)) {
    throw createError("parseError", StatusCodes.INTERNAL_SERVER_ERROR);
  }

  return hashtags;
}
