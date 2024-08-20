import mongoose, { Schema, type Model } from "mongoose";

interface IHistory {
  date: Date;
  code: string;
}

const historySchema = new Schema<IHistory>(
  {
    date: Date,
    code: String,
  },
  {
    _id: false,
  },
);

export interface IVerificationCode {
  /**
   * Format: `Type|Identifier`
   */
  _id: string;
  code: string;
  history: Array<IHistory>;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationCodeSchema = new Schema<IVerificationCode>({
  _id: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
  },
  history: {
    type: [historySchema],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24, // Expire after 24 hours
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const VerificationCode =
  (mongoose.models.VerificationCode as Model<IVerificationCode>) ||
  mongoose.model<IVerificationCode>("VerificationCode", VerificationCodeSchema);

export default VerificationCode;
