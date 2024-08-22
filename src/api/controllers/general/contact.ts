import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { validateData } from "../../../utilities/validation.js";
import { sendSlackMessage } from "../SlackController.js";

const body = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  subject: z.string().min(1),
  content: z.string().min(1),
});

type Body = z.infer<typeof body>;

export const contactValidation = validateData({
  body: body,
});

export async function contact(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = req.user;

    const { name, email, subject, content } = req.body as Body;

    let message = `Contact form submission from *${name}* (${email})\nSubject: *${subject}*\nContent:\`\`\`${content}\`\`\`\nDate: ${new Date().toLocaleString()}`;

    if (authUser) {
      message += `\nUser signed in as ${authUser.name} (@${authUser.username} | ${authUser.email.address})`;
    }

    await sendSlackMessage("phantomAssistant", message, undefined, true);

    res.sendStatus(StatusCodes.NO_CONTENT);
  } catch (err) {
    next(err);
  }
}
