import { z } from "zod";

export const zUserEarningsSchema = z.object({
  /**
   * Cents
   */
  balance: z.number(),

  /**
   * Cents
   */
  total: z.number(),
});

export type IUserEarnings = z.infer<typeof zUserEarningsSchema>;
