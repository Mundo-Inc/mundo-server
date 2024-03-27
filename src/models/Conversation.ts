import mongoose, { Schema, type Document } from "mongoose";

export interface IConversation extends Document {
  _id: string; // MongoDB's unique identifier for the document
  friendly_name: string; // A human-readable name for the conversation
  participants: {
    user: mongoose.Types.ObjectId; // Reference to a User document
    role: string; // The participant's role in the conversation
    chat: string; // Presumably the Twilio chat SID
  }[];
  tags?: string[]; // An optional array of tags for categorization
  created_by: string; // Who created the conversation, with restricted values
  is_closed: boolean; // Whether the conversation is closed
  created_at: Date; // When the conversation was created
  updated_at: Date; // When the conversation was last updated
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
