const strings = {
  server: {
    internalError: "Internal server error",
    invalidAction:
      "The action you have specified is not supported. Please use a valid action.",
  },
  validations: {
    missRequiredFields: "Missing required fields",
    invalidType: "Invalid type",
    invalidUsername:
      "Username can only contain letters, numbers and underscores",
    invalidUsernameLength: "Username must be between 5 and 20 characters",
  },
  authorization: {
    otherUser: "Not authorized to perform this action for other user",
    userOnly: "Not authorized to perform this action",
    loginRequired: "Login required",
    accessDenied: "Access denied",
    invalidCredentials: "Invalid credentials",
  },
  comments: {
    alreadyLiked: "You have already liked this comment",
    notLiked: "You have not liked this comment",
  },
  media: {
    notProvided: "Media not provided",
  },
  mail: {
    verfyEmailSent: "Mail has been sent for verification",
    resetPassEmailSent: "Mail has been sent for reset password",
    resetPassNotProvidedForSocialMethods: "You signed up with social methods.",
    resetPassLinkInvalid: "This password reset link is invalid or has expired.",
    tokenIsInvalid: "Provided token for reset password is invalid.",
    passwordReset: "Password has beed reset and updated.",
    resetPasswordWaiting:
      "You must wait 1 minute between sending reset password emails.",
    userNotRequestedResetPassword: "User has not requested reset password.",
    sameAsPreviousPassword:
      "You should choose a password not equal to previous password.",
    tokenIsRequired: "Token is required",
    invalidToken: "Invalid token",
    emailVerified: "Email verified successfully",
    verificationWaiting: "You must wait 30 minutes between sending emails.",
    alreadyVerified: "This email is already verified",
    verifyLinkExpired: "Verification link has expired",
  },
  blocks: {
    user: {
      isBlocked: "You have blocked this user",
      hasBlocked: "This user has blocked you",
    },
  },
  user: {
    noLatestPlace: "No latest place",
    usernameTaken: "Username is already taken",
  },
  upload: {
    invalidFile: "Invalid file",
    invalidType: "Invalid file type",
  },
  review: {
    invalidScore: "Invalid score provided",
    invalidScoreKey: "Invalid score key provided",
  },
};
export default strings;

export const dStrings = {
  /**
   * @param {0} name - name of the item
   */
  notFound: `{0} not found`,

  /**
   * @param {0} method - method name
   */
  methodNotAllowed: `Method {0} not allowed`,

  /**
   * @param {0} item - item name
   */
  alreadyExists: `{0} already exists`,
};

export function dynamicMessage(
  template: string,
  ...args: (string | undefined)[]
) {
  let message = template;
  for (let i = 0; i < args.length; i++) {
    message = message.replace(`{${i}}`, args[i] || "-");
  }
  return message;
}
