const fs = require("fs");
const path = require("path");
const staticConfig = require("./app.json");

const expoConfig = staticConfig.expo ?? {};
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
const googleServicesPath = path.join(__dirname, "google-services.json");

module.exports = {
  expo: {
    ...expoConfig,
    extra: {
      ...(expoConfig.extra ?? {}),
      eas: {
        ...((expoConfig.extra ?? {}).eas ?? {}),
        ...(projectId ? { projectId } : {}),
      },
    },
    android: {
      ...(expoConfig.android ?? {}),
      ...(fs.existsSync(googleServicesPath) ? { googleServicesFile: "./google-services.json" } : {}),
    },
  },
};
