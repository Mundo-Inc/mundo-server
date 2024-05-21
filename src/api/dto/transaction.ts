import { type ITransaction } from "../../models/Transaction.js";

const TransactionProjection = {
  public: {
    _id: true,
    sender: true,
    recipient: true,
    amount: true,
    serviceFee: true,
    totalAmount: true,
    message: true,
    createdAt: true,
    updatedAt: true,
  },
};

// public key union
export type TransactionPublicKeys = keyof typeof TransactionProjection.public;
export type TransactionProjectionPublic = Pick<
  ITransaction,
  TransactionPublicKeys
>;

export default TransactionProjection;
