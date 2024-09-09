import { Schema, Types } from "mongoose";
import { z } from "zod";

export const zConversationParticipant = z.object({
  user: z.instanceof(Types.ObjectId),
  read: z
    .object({
      index: z.number(),
      date: z.date(),
    })
    .optional(),
});

export type IConversationParticipant = z.infer<typeof zConversationParticipant>;

const conversationParticipantSchema = new Schema<IConversationParticipant>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    read: {
      type: {
        index: { type: Number, required: true },
        date: { type: Date, required: true },
      },
      default: undefined,
      required: false,
    },
  },
  {
    _id: false,
  },
);

export default conversationParticipantSchema;
