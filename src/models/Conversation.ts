import mongoose, { Schema, type Document } from "mongoose";

export interface IConversation extends Document {
  _id: string;
  friendly_name: string;
  participants: { user: mongoose.Types.ObjectId[]; role: string; chat: string };
  tags?: string;
  created_by: string;
  is_closed: boolean;
  created_at: Date;
  updated_at: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    _id: {
      // Twilio Conversation SID
      type: String,
      required: true,
    },
    friendly_name: {
      type: String,
      required: true,
    },
    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        role: String,
        chat: String, // SID
      },
    ],
    tags: {
      // Optional tags
      type: [String],
    },
    created_by: {
      type: String,
      enum: ["admin", "user", "system"],
      default: "user",
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    is_closed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);
