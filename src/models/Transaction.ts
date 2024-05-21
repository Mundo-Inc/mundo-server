import mongoose, { Schema, type Model } from "mongoose";

enum TransactionStatusEnum {
  pending = "pending",
  completed = "completed",
  failed = "failed",
}

export interface ITransaction {
  _id: mongoose.Types.ObjectId;
  amount: Number;
  serviceFee: Number;
  totalAmount: Number;
  sender: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  paymentIntentId: string;
  status: TransactionStatusEnum;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    serviceFee: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentIntentId: { type: String, required: true },
    message: { type: String, default: "", maxlength: 1024 },
    status: {
      type: String,
      enum: Object.values(TransactionStatusEnum),
      default: TransactionStatusEnum.pending,
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ sender: 1 });
TransactionSchema.index({ recipient: 1 });
TransactionSchema.index({ paymentIntentId: 1 });

const model =
  (mongoose.models.Transaction as Model<ITransaction>) ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);

export default model;
