import mongoose, { Schema, type Model } from "mongoose";

enum WithdrawalStatusEnum {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed",
}

export interface IWithdrawal {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  amount: number;
  payoutId: string;
  status: WithdrawalStatusEnum;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalSchema = new Schema<IWithdrawal>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    payoutId: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(WithdrawalStatusEnum),
      default: WithdrawalStatusEnum.Pending,
    },
  },
  {
    timestamps: true,
  },
);

WithdrawalSchema.index({ user: 1 });
WithdrawalSchema.index({ payoutId: 1 });

const Withdrawal =
  (mongoose.models.Withdrawal as Model<IWithdrawal>) ||
  mongoose.model<IWithdrawal>("Withdrawal", WithdrawalSchema);

export default Withdrawal;
