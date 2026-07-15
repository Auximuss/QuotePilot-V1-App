import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.quotepilot.app",
  appName: "QuotePilot",
  webDir: "out",
  // Points to your live Vercel app — no static export needed
  server: {
    url: "https://quote-pilot-v1-app.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0e0e0e",
  },
};

export default config;
