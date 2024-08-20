import { z } from "zod";

export const zUserEarningsSchema = z.object({
  balance: z.number(),
  total: z.number(),
});

export type IUserEarnings = z.infer<typeof zUserEarningsSchema>;
