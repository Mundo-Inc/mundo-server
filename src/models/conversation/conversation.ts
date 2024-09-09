import mongoose, { Schema, Types, type Model } from "mongoose";
import { z } from "zod";
import conversationParticipantSchema, {
  zConversationParticipant,
} from "./conversationParticipant.js";

export const zConversationSchema = z.object({
  _id: z.instanceof(Types.ObjectId),
  participants: z.array(zConversationParticipant),
  /**
   * Title of the conversation if it's a group chat
   */
  title: z.string().optional(),
  isGroup: z.boolean(),
  lastActivity: z.date(),
  lastMessageIndex: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type IConversation = z.infer<typeof zConversationSchema>;

const ConversationSchema = new Schema<IConversation>(
  {
    participants: {
      type: [conversationParticipantSchema],
      required: true,
    },
    title: {
      type: String,
      required: false,
    },
    isGroup: {
      type: Boolean,
      required: true,
    },
    lastActivity: {
      type: Date,
      required: true,
    },
    lastMessageIndex: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

ConversationSchema.index({ "participants.user": 1 });

const Conversation =
  (mongoose.models.Conversation as Model<IConversation>) ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);

export default Conversation;
