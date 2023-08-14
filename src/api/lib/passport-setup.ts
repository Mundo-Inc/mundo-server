import path from "path";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as AppleStrategy } from "passport-apple";

const applePrivateKeyPath = path.resolve(
  __dirname,
  `../../../keys/${process.env.APPLE_SIGNIN_PRIVATE_KEY_NAME!}`
);

import {
  handleGoogleProfile,
  handleFacebookProfile,
  handleAppleProfile,
} from "./profile-handlers";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.URL!}/api/v1/auth/social_callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      const user = await handleGoogleProfile(profile);
      if (user) {
        done(null, user);
      } else {
        done(new Error("Your email is not whitelisted."));
      }
    }
  )
);

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID!,
      clientSecret: process.env.FACEBOOK_APP_SECRET!,
      callbackURL: `${process.env.NEXTAUTH_URL!}/api/auth/social_callback`,
      profileFields: ["id", "emails", "name"],
    },
    async (accessToken, refreshToken, profile, done) => {
      const user = await handleFacebookProfile(profile);
      if (user) {
        done(null, user);
      } else {
        done(new Error("Your email is not whitelisted."));
      }
    }
  )
);

declare module "passport-apple" {
  // add teamId to StrategyOptions and StrategyOptionsWithRequest
  export interface StrategyOptionsWithRequest {
    teamID?: string;
  }
  export interface StrategyOptions {
    teamID?: string;
  }
}

passport.use(
  // @ts-ignore
  new AppleStrategy(
    {
      clientID: process.env.APPLE_CLIENT_ID!,
      teamID: process.env.APPLE_TEAM_ID!,
      callbackURL: `${process.env.NEXTAUTH_URL!}/api/auth/social_callback`,
      keyID: process.env.APPLE_SIGNIN_KEY_ID!,
      privateKeyLocation: applePrivateKeyPath,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, idToken, profile, done) => {
      const user = await handleAppleProfile(idToken, profile);
      if (user) {
        done(null, user);
      } else {
        done(new Error("Your email is not whitelisted."));
      }
    }
  )
);

export default passport;
