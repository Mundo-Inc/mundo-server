import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ITransaction {
  _id: mongoose.Types.ObjectId;
  amount: Number;
  serviceFee: Number;
  totalAmount: Number;
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  paymentIntentId: string;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>({
  amount: { type: Number, required: true },
  serviceFee: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  paymentIntentId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const model =
  (mongoose.models.Transaction as Model<ITransaction>) ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);

export default model;
