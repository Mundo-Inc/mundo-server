import { Configuration, OpenAIApi } from "openai";
import { predefinedTags } from "../models/Review";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

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
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: options.fullScores
            ? `You are an assistant that reads reviews of different places and extracts review's sentiment. For each review, provide a rating from 1 to 5 in the following categories respectively 1. Drink quality, 2. Food quality, 3. Atmosphere, 4. Service, 5. Value for the price. For any category not mentioned in the review, assign a rating of N/A. Additionally, select hashtags from the hashtag_list that best describe the review. Give the scores in the following format: x/5. Don't give any unnecessary information.
            hashtag_list = gourmet_cuisine, local_ingredients, organic_food, extensive_wine_list, craft_beers, innovative_cocktails, delicious_desserts, fresh_seafood, authentic_cuisine, romantic_setting, family_friendly, business_meetings, outdoor_seating, live_music, waterfront_view, rooftop, cozy_atmosphere, highend_luxury, trendy_spot, rustic_charm, excellent_service, friendly_staff, knowledgeable_sommelier, quick_service, personalized_service, late_night, brunch_spot, happy_hour, pet_friendly, wheelchair_accessible, vegan_options, gluten_free_options, private_dining, chefs_table, tasting_menu, budget_friendly, midrange_pricing, fine_dining, city_center, off_the_beaten_path, scenic_location, neighborhood_gem, italian, french, asian, mexican, mediterranean, seafood, steakhouse, fusion, bbq, vegan, slow_service, limited_menu, overpriced, crowded, noisy_environment, limited_vegan_options, limited_drink_selection, poor_accessibility`
            : `You are an assistant that reads reviews of different places and extracts review's sentiment. For each review, provide a rating from 1 to 5 in the following categories respectively 1. Drink quality, 2. Food quality. For any category not mentioned in the review, assign a rating of N/A. Additionally, select hashtags from the hashtag_list that best describe the review. Give the scores in the following format: x/5. Don't give any unnecessary information.
  hashtag_list = gourmet_cuisine, local_ingredients, organic_food, extensive_wine_list, craft_beers, innovative_cocktails, delicious_desserts, fresh_seafood, authentic_cuisine, romantic_setting, family_friendly, business_meetings, outdoor_seating, live_music, waterfront_view, rooftop, cozy_atmosphere, highend_luxury, trendy_spot, rustic_charm, excellent_service, friendly_staff, knowledgeable_sommelier, quick_service, personalized_service, late_night, brunch_spot, happy_hour, pet_friendly, wheelchair_accessible, vegan_options, gluten_free_options, private_dining, chefs_table, tasting_menu, budget_friendly, midrange_pricing, fine_dining, city_center, off_the_beaten_path, scenic_location, neighborhood_gem, italian, french, asian, mexican, mediterranean, seafood, steakhouse, fusion, bbq, vegan, slow_service, limited_menu, overpriced, crowded, noisy_environment, limited_vegan_options, limited_drink_selection, poor_accessibility`,
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
    if (response.data.usage?.total_tokens) {
      tokensUsed = response.data.usage?.total_tokens!;
    }

    let rewrite = "";
    if (options.rewrite) {
      const response = await openai.createChatCompletion({
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
      rewrite = response.data.choices[0]?.message?.content!;
      if (response.data.usage?.total_tokens) {
        tokensUsed += response.data.usage?.total_tokens;
      }
    }

    try {
      if (!response.data?.choices) {
        throw new Error("notValidResponse");
      }

      const responseText = response.data.choices[0].message?.content!;

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
    throw new Error("parseError");
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
