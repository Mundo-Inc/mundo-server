import mongoose, { Schema, type Document } from "mongoose";

interface ITag extends Document {
  createdAt: Date;
}

const TagSchema: Schema = new Schema<ITag>({
  _id: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.models.Tag || mongoose.model<ITag>("Tag", TagSchema);
