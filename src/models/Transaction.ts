import mongoose, { Schema, type Document } from "mongoose";

interface ITransaction extends Document {
  amount: Number;
  serviceFee: Number;
  totalAmount: Number;
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  chargeId: string;
  createdAt: Date;
}

const TransactionSchema: Schema = new Schema<ITransaction>({
  amount: { type: Number, required: true },
  serviceFee: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  chargeId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Transaction ||
  mongoose.model<ITransaction>("Transaction", TransactionSchema);
