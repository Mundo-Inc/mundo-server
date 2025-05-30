import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import type { TransactionProjectionPublic } from "../../../api/dto/transaction.js";
import TransactionProjection from "../../../api/dto/transaction.js";
import {
  type UserProjectionType,
  UserProjection,
} from "../../../api/dto/user.js";
import Transaction from "../../../models/transaction.js";
import { dStrings as ds, dynamicMessage } from "../../../strings.js";
import { createError } from "../../../utilities/errorHandlers.js";
import { createResponse } from "../../../utilities/response.js";
import { validateData, zObjectId } from "../../../utilities/validation.js";

const params = z.object({
  transactionId: zObjectId,
});

type Params = z.infer<typeof params>;

export const getTransactionValidation = validateData({
  params: params,
});

export async function getTransaction(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authUser = req.user!;

    const { transactionId } = req.params as unknown as Params;

    const transaction = await Transaction.findById(transactionId)
      .select<TransactionProjectionPublic>(TransactionProjection.public)
      .orFail(
        createError(
          dynamicMessage(ds.notFound, "Transaction"),
          StatusCodes.NOT_FOUND,
        ),
      )
      .populate<{
        sender: UserProjectionType["essentials"];
      }>("sender", UserProjection.essentials)
      .populate<{
        recipient: UserProjectionType["essentials"];
      }>("recipient", UserProjection.essentials)
      .lean();

    if (
      !authUser._id.equals(transaction.sender._id) &&
      !authUser._id.equals(transaction.recipient._id)
    ) {
      throw createError(
        "You are not authorized to view this transaction",
        StatusCodes.UNAUTHORIZED,
      );
    }

    res.status(StatusCodes.OK).json(createResponse(transaction));
  } catch (error) {
    next(error);
  }
}
