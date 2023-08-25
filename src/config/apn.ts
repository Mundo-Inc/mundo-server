import apn from "@parse/node-apn";
import path from "path";

const pwd = process.cwd();

const keyPath = path.resolve(
  pwd,
  `keys/${process.env.APPLE_APN_PRIVATE_KEY_NAME!}`
);

const options = {
  token: {
    key: keyPath,
    keyId: process.env.APPLE_APN_KEY_ID!,
    teamId: process.env.APPLE_TEAM_ID!,
  },
  production: process.env.NODE_ENV === "production",
};

const apnProvider = new apn.Provider(options);

export default apnProvider;
