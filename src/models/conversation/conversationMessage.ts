import mongoose, { Schema, Types, type Model } from "mongoose";
import { z } from "zod";

export const zConversationMessageSchema = z.object({
  _id: z.instanceof(Types.ObjectId),
  conversation: z.instanceof(Types.ObjectId),
  sender: z.instanceof(Types.ObjectId),
  content: z.string(),
  attachments: z.array(z.instanceof(Types.ObjectId)).optional(),
  index: z.number(),

  createdAt: z.date(),
  updatedAt: z.date(),
});

export type IConversationMessage = z.infer<typeof zConversationMessageSchema>;

const ConversationMessageSchema = new Schema<IConversationMessage>(
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
      default: undefined,
    },
    index: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

const ConversationMessage =
  (mongoose.models.ConversationMessage as Model<IConversationMessage>) ||
  mongoose.model<IConversationMessage>(
    "ConversationMessage",
    ConversationMessageSchema,
  );

export default ConversationMessage;
