import mongoose, { Schema, Document } from "mongoose";

interface IWaitlist extends Document {
  email: string;
  isWhitelisted: boolean;
}

const WaitlistSchema = new Schema<IWaitlist>({
  email: {
    type: String,
    required: true,
    index: true,
    trim: true,
    unique: true,
  },
  isWhitelisted: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.models.Waitlist ||
  mongoose.model<IWaitlist>("Waitlist", WaitlistSchema);
