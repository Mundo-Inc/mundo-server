import { StatusCodes } from "http-status-codes";
import OpenAI from "openai";

import { predefinedTags } from "../models/Review";
import { createError } from "./errorHandlers";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function openAiAnalyzeReview(
  text: string,
  options?: {
    rewrite?: boolean;
    fullScores?: boolean;
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
      fullScores: false,
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: options.fullScores
            ? `You are an assistant that reads reviews of different places and extracts review's sentiment. For each review, provide a rating from 1 to 5 in the following categories respectively 1. Drink quality, 2. Food quality, 3. Atmosphere, 4. Service, 5. Value for the price. For any category not mentioned in the review, assign a rating of N/A. Additionally, suggest some hashtags that best describe the review. Give the scores in the following format: x/5. Don't give any unnecessary information.`
            : `You are an assistant that reads reviews of different places and extracts review's sentiment. For each review, provide a rating from 1 to 5 in the following categories respectively 1. Drink quality, 2. Food quality. For any category not mentioned in the review, assign a rating of N/A. Additionally, suggest some hashtags that best describe the review. Give the scores in the following format: x/5. Don't give any unnecessary information.`,
        },
        {
          role: "system",
          content: options.fullScores
            ? `Response example:\nDrink Quality: N/A\nFood Quality: 4/5\nAtmosphere: 4/5\nService: N/A\nValue for the Price: 3/5\nHashtags: #italian, #cozy_atmosphere, #trendy_spot, #limited_drink_selection, #slow_service`
            : `Response example:\nDrink Quality: N/A\nFood Quality: 4/5\nHashtags: #italian, #cozy_atmosphere, #trendy_spot, #limited_drink_selection, #slow_service`,
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

      let { scores, hashtags } = formatOpenAiResponse(
        responseText,
        options.fullScores
      );

      return {
        error: false,
        response: response,
        rewrite: rewrite,
        scores,
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

export function formatOpenAiResponse(
  responseText: string,
  fullScores?: boolean
) {
  const hashtags = responseText
    .match(/#[a-zA-Z0-9_]+/g)
    ?.map((h) => h.replace("#", ""))
    .filter((h) => predefinedTags.includes(h));
  const ratings = responseText.match(/.\/5|N\/A|\d.\d\/5|\d.\d\/10|\d\/10/g);

  if (
    hashtags === null ||
    ratings === null ||
    !Array.isArray(hashtags) ||
    !Array.isArray(ratings) ||
    ratings.length !== (fullScores ? 5 : 2)
  ) {
    throw createError("parseError", StatusCodes.INTERNAL_SERVER_ERROR);
  }

  const scores = fullScores
    ? {
        drinkQuality: getScore(ratings[0]),
        foodQuality: getScore(ratings[1]),
        atmosphere: getScore(ratings[2]),
        service: getScore(ratings[3]),
        value: getScore(ratings[4]),
      }
    : {
        drinkQuality: getScore(ratings[0]),
        foodQuality: getScore(ratings[1]),
      };

  return {
    hashtags,
    scores,
  };
}

function getScore(scoreString: string) {
  if (scoreString === "N/A") {
    return undefined;
  } else if (scoreString === "-/5") {
    return undefined;
  } else {
    const num = scoreString.split("/")[0];
    if (Number.isInteger(Math.round(Number(num)))) {
      if (parseInt(scoreString.split("/")[1]) === 10) {
        return Math.round(Number(num) / 2);
      } else {
        return Math.round(Number(num));
      }
    } else {
      return undefined;
    }
  }
}
