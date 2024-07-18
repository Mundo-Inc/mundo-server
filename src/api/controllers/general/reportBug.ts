import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import logger from "@/api/services/logger/index.js";
import { createError } from "@/utilities/errorHandlers.js";
import { validateData } from "@/utilities/validation.js";
import { createDecipheriv, createHash } from "crypto";
import { sendSlackMessage } from "../SlackController.js";

const body = z.object({
  body: z.string().min(1).optional(),
  function: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  message: z.string().optional(),
});

type Body = z.infer<typeof body>;

export const reportBugValidation = validateData({
  body: body,
});

export async function reportBug(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authUser = req.user;

    const {
      body,
      function: functionName,
      file,
      line,
      message,
    } = req.body as Body;

    if (body && authUser) {
      type CrashReport = {
        function: string;
        file: string;
        line: number;
        message: string;
      };

      function decrypt(
        encryptedData: string,
        userId: string
      ): CrashReport | null {
        try {
          const dataBuffer = Buffer.from(encryptedData, "base64"); // Decode the Base64 string to a buffer
          const keyData = Buffer.from(userId); // Convert userId to buffer
          const key = createHash("sha256").update(keyData).digest(); // Generate SHA-256 hash of the keyData
          const iv = dataBuffer.subarray(0, 12); // The IV is typically the first 12 bytes for AES-GCM
          const encrypted = dataBuffer.subarray(12, dataBuffer.length - 16); // The encrypted data, excluding IV and authentication tag
          const tag = dataBuffer.subarray(dataBuffer.length - 16); // The authentication tag is the last 16 bytes

          const decipher = createDecipheriv("aes-256-gcm", key, iv);
          decipher.setAuthTag(tag);
          const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
          ]); // Combine decrypted chunks

          return JSON.parse(decrypted.toString());
        } catch (error) {
          logger.error("Decryption error:", error);
          return null;
        }
      }

      const crashReport = decrypt(body, authUser._id.toString());

      if (crashReport) {
        sendSlackMessage(
          "devAssistant",
          `Bug report\nfunction:\n\`${crashReport.function}\`\nfile:\n\`${crashReport.file}\` line \`${crashReport.line}\`\nmessage:\n\`\`\`${crashReport.message}\`\`\`\nuser: ${authUser.name} (${authUser.email.address})`,
          undefined,
          true
        );
      }
    } else if (functionName && file && line && message) {
      sendSlackMessage(
        "devAssistant",
        `Bug report\nfunction:\n\`${functionName}\`\nfile:\n\`${file}\` line \`${line}\`\nmessage:\n\`\`\`${message}\`\`\`\nuser: ${
          authUser ? `${authUser.name} (${authUser.email.address})` : "Unknown"
        }`,
        undefined,
        true
      );
    } else {
      throw createError("Bad request", StatusCodes.BAD_REQUEST);
    }

    res.sendStatus(StatusCodes.OK);
  } catch (err) {
    next(err);
  }
}
