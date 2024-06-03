import { createDecipheriv, createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { body, param, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import AppSetting from "../../models/AppSetting.js";
import {
  createError,
  handleInputErrors,
} from "../../utilities/errorHandlers.js";
import { sendSlackMessage } from "./SlackController.js";

export const reportBugValidation: ValidationChain[] = [
  body("body").optional().isString().notEmpty(),
  body("function").optional().isString(),
  body("file").optional().isString(),
  body("line").optional().isNumeric(),
  body("message").optional().isString(),
];

export async function reportBug(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const authUser = req.user;

    const {
      body,
      functionName,
      file,
      line,
      message,
    }: {
      body: string | undefined;
      functionName: string | undefined;
      file: string | undefined;
      line: number | undefined;
      message: string | undefined;
    } = req.body;

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
          console.error("Decryption error:", error);
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

export const getVersionInfoValidation: ValidationChain[] = [
  param("version").isString().notEmpty(),
];
export async function getVersionInfo(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);
    const { version } = req.params;

    const [latestAppVersion, minOperationalVersion] = await Promise.all([
      AppSetting.findOne({ key: "latestAppVersion" })
        .orFail(createError("App settings not found", StatusCodes.NOT_FOUND))
        .lean(),
      AppSetting.findOne({ key: "minOperationalVersion" })
        .orFail(createError("App settings not found", StatusCodes.NOT_FOUND))
        .lean(),
    ]);

    const isLatest = version === latestAppVersion.value;
    const compare = compareVersion(version, minOperationalVersion.value);

    const isOperational = compare >= 0;

    res.status(StatusCodes.OK).json({
      isLatest,
      latestAppVersion: latestAppVersion.value,
      isOperational,
      minOperationalVersion: minOperationalVersion.value,
      message: isOperational ? "" : "Please update to the latest version",
    });
  } catch (err) {
    next(err);
  }
}

function compareVersion(v1: string, v2: string) {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0; // default to 0 if no part exists
    const part2 = parts2[i] || 0; // default to 0 if no part exists

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0; // versions are equal
}
