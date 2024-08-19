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
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type IConversationSchema = z.infer<typeof zConversationSchema>;

const ConversationSchema = new Schema<IConversationSchema>(
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
  },
  { timestamps: true },
);

ConversationSchema.index({ "participants.user": 1 });

const Conversation =
  (mongoose.models.Conversation as Model<IConversationSchema>) ||
  mongoose.model<IConversationSchema>("Conversation", ConversationSchema);

export default Conversation;
