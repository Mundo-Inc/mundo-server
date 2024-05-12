import { type ITransaction } from "../../models/Transaction";

const TransactionProjection = {
  public: {
    _id: true,
    amount: true,
    serviceFee: true,
    totalAmount: true,
    sender: true,
    receiver: true,
    createdAt: true,
  },
};

// public key union
export type TransactionPublicKeys = keyof typeof TransactionProjection.public;
export type TransactionProjectionPublic = Pick<
  ITransaction,
  TransactionPublicKeys
>;

export default TransactionProjection;
