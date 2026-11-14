import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");
const environment = {
  ...process.env,
  EXPO_NO_DOTENV: "1",
  APP_VARIANT: "qa",
  EXPO_PUBLIC_API_URL: "https://lyricord.com.ar",
  EXPO_PUBLIC_REGISTRATION_URL: "https://lyricord.com.ar/register",
  EXPO_PUBLIC_REVENUECAT_DISABLED: "true",
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "",
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "",
};

const expo = spawn(process.execPath, [expoCli, "start", "--dev-client", "--clear", "--scheme", "musum-qa"], {
  env: environment,
  stdio: "inherit",
});

expo.on("error", (error) => {
  console.error("No se pudo iniciar Metro para Musum QA.", error);
  process.exit(1);
});

expo.on("exit", (code) => {
  process.exit(code ?? 1);
});
