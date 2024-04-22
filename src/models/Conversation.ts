import mongoose, { Schema, type Document } from "mongoose";

export interface IParticipant {
  user: mongoose.Types.ObjectId | string;
  role: string;
  chat: string;
}
export interface IConversation extends Document {
  _id: string; // MongoDB's unique identifier for the document
  friendly_name: string; // A human-readable name for the conversation
  participants: IParticipant[];
  tags?: string[]; // An optional array of tags for categorization
  createdBy: mongoose.Types.ObjectId; // Who created the conversation, with restricted values
  is_closed: boolean; // Whether the conversation is closed
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
