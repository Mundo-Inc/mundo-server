import mongoose, { Schema, type Model } from "mongoose";

export interface IParticipant {
  user: mongoose.Types.ObjectId;
  role: string;
  chat: string;
}
export interface IConversation {
  _id: string; // Twilio Conversation SID
  friendlyName: string; // A human-readable name for the conversation
  participants: IParticipant[];
  tags?: string[]; // An optional array of tags for categorization
  createdBy: mongoose.Types.ObjectId; // Who created the conversation, with restricted values
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    _id: {
      // Twilio Conversation SID
      type: String,
      required: true,
    },
    friendlyName: {
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
    isClosed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const model =
  (mongoose.models.Conversation as Model<IConversation>) ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);

export default model;
