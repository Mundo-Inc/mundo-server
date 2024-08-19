import mongoose, { Schema, Types, type Model } from "mongoose";
import { z } from "zod";

export const zChatMessageSchema = z.object({
  _id: z.instanceof(Types.ObjectId),
  conversation: z.instanceof(Types.ObjectId),
  sender: z.instanceof(Types.ObjectId),
  content: z.string(),
  attachments: z.array(z.instanceof(Types.ObjectId)).optional(),

  createdAt: z.date(),
  updatedAt: z.date(),
});

export type IChatMessage = z.infer<typeof zChatMessageSchema>;

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    attachments: {
      type: [{ type: Schema.Types.ObjectId, ref: "Media", _id: false }],
    },
  },
  { timestamps: true },
);

const ChatMessage =
  (mongoose.models.ChatMessage as Model<IChatMessage>) ||
  mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);

export default ChatMessage;
