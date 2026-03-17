import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f8fb",
          100: "#e8f0f7",
          200: "#c8dced",
          500: "#1f5f8b",
          600: "#154d73",
          700: "#113f5f",
          900: "#0b2a3f"
        },
        accent: {
          500: "#d97706",
          600: "#b45309"
        }
      },
      boxShadow: {
        panel: "0 8px 30px rgba(11, 42, 63, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
