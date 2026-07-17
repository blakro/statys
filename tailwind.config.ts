import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Palette « banking-grade » : bleu nuit institutionnel.
        navy: {
          50: "#f0f4fa",
          100: "#dce5f3",
          200: "#bfcfe8",
          300: "#94b0d8",
          400: "#638ac4",
          500: "#416cae",
          600: "#315493",
          700: "#294477",
          800: "#253a63",
          900: "#233354",
          950: "#0f1c2e",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
