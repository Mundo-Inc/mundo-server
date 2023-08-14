export type EditReviewDto = {
  scores: {
    overall: number;
    drinkQuality: number;
    foodQuality: number;
    atmosphere: number;
    service: number;
    value: number;
  };
  content: string;
  images?: string[];
  videos?: string[];
};
