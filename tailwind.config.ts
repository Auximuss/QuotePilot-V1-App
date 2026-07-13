import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Structural colors use CSS variables so dark/light mode works
        // automatically across every component without touching class names.
        ink: "var(--ink)",
        panel: "var(--panel)",
        panelRaised: "var(--panel-raised)",
        paper: "var(--paper)",
        line: "var(--line)",
        lineLight: "var(--line-light)",
        textDim: "var(--text-dim)",
        textDimmer: "var(--text-dimmer)",
        // Accent colours stay fixed — they don't change between themes.
        hazard: "#ff6a1f",
        hazard2: "#ff8a4c",
        hazardDim: "#ff6a1f1f",
        ok: "#3fae5c",
        warn: "#e0a726",
      },
      fontFamily: {
        archivo: ["var(--font-archivo)"],
        barlow: ["var(--font-barlow)"],
        work: ["var(--font-work)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        wavePulse: {
          "0%, 100%": { transform: "scaleY(.4)" },
          "50%": { transform: "scaleY(1)" },
        },
        micPulse: {
          "0%, 100%": { boxShadow: "0 0 0 8px #ff6a1f1f, 0 10px 30px -6px rgba(255,106,31,.6)" },
          "50%": { boxShadow: "0 0 0 14px #ff6a1f1f, 0 10px 34px -6px rgba(255,106,31,.75)" },
        },
        blink: {
          "50%": { opacity: "0" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        wavePulse: "wavePulse 1.1s ease-in-out infinite",
        micPulse: "micPulse 1.4s ease-in-out infinite",
        blink: "blink 1s step-end infinite",
        rise: "rise .5s cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};
export default config;
