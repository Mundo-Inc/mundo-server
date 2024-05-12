import mongoose, { Schema, type Model } from "mongoose";

interface ICategory {
  _id: string;
  title: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>({
  _id: {
    type: String,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

const model =
  (mongoose.models.Category as Model<ICategory>) ||
  mongoose.model<ICategory>("Category", CategorySchema);

export default model;
