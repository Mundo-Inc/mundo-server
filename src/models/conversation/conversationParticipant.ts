import { Schema, Types } from "mongoose";
import { z } from "zod";

export const zConversationParticipant = z.object({
  user: z.instanceof(Types.ObjectId),
  read: z.object({
    index: z.number(),
    date: z.date(),
  }),
});

export type IConversationParticipant = z.infer<typeof zConversationParticipant>;

const conversationParticipantSchema = new Schema<IConversationParticipant>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    read: {
      index: Number,
      date: Date,
    },
  },
  {
    _id: false,
  },
);

export default conversationParticipantSchema;
