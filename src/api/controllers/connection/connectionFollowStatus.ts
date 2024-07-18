import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { getConnectionStatus } from "@/utilities/connections.js";
import { validateData, zObjectId } from "@/utilities/validation.js";

const params = z.object({
  id: zObjectId,
});

type Params = z.infer<typeof params>;

export const connectionFollowStatusValidation = validateData({
  params: params,
});

export async function connectionFollowStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user!;

    const { id } = req.params as unknown as Params;

    const connectionStatus = await getConnectionStatus(authUser._id, id);

    return res.status(StatusCodes.OK).json({
      success: true,
      data: connectionStatus,
    });
  } catch (error) {
    next(error);
  }
}
