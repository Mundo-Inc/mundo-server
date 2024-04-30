export type PublicReadTransactionDto = {
  _id: string;
  amount: number;
  serviceFee: number;
  totalAmount: number;
  sender: any;
  receiver: any;
  createdAt: Date;
};

export const publicReadTransactionProjection: {
  [Property in keyof PublicReadTransactionDto]?: any;
} = {
  _id: true,
  amount: true,
  serviceFee: true,
  totalAmount: true,
  sender: true,
  receiver: true,
  createdAt: true,
};
