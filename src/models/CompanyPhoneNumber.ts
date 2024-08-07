import mongoose, { Schema, type Model } from "mongoose";

export interface ICompanyPhoneNumber {
  _id: mongoose.Types.ObjectId;
  number: string;
  isActive: boolean;
  messagesSent: number;
  lastMessageDate: Date;

  createdAt: Date;
  updatedAt: Date;
}

const CompanyPhoneNumberSchema = new Schema<ICompanyPhoneNumber>(
  {
    number: {
      type: String,
      required: true,
      unique: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    messagesSent: {
      type: Number,
      required: true,
      default: 0,
    },
    lastMessageDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const CompanyPhoneNumber =
  (mongoose.models.CompanyPhoneNumber as Model<ICompanyPhoneNumber>) ||
  mongoose.model<ICompanyPhoneNumber>(
    "CompanyPhoneNumber",
    CompanyPhoneNumberSchema,
  );

export default CompanyPhoneNumber;
