import mongoose, { Schema, type Document } from "mongoose";

export interface IDeal extends Document {
  title: string;
  productName: string;
  description: string;
  price: number;
  discoutRequest: number;
  vendor: {
    firstname: string;
    lastname: string;
    email: string;
    phone: string;
  };
  isAccepted?: boolean;
  place: mongoose.Types.ObjectId;
  image?: string;
  creator: mongoose.Types.ObjectId;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DealSchema = new Schema<IDeal>(
  {
    title: { type: String, required: true },
    productName: { type: String, required: true },
    description: { type: String, trim: true, required: true },
    price: { type: Number, required: true },
    discoutRequest: { type: Number, required: true },
    vendor: {
      firstname: { type: String, required: true },
      lastname: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },
    place: { type: Schema.Types.ObjectId, ref: "Place", required: true },
    image: { type: String },
    isAccepted: { type: Boolean, defautl: false },
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, defautl: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.Deal ||
  mongoose.model<IDeal>("Deal", DealSchema);
