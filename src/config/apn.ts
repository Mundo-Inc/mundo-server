import apn from "@parse/node-apn";
import path from "path";

let apnProvider: apn.Provider | null = null;

if (process.env.NODE_ENV === "production") {
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

  apnProvider = new apn.Provider(options);
}

export default apnProvider;
