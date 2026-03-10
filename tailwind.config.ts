import type { Config } from "tailwindcss";

const config = {
  darkMode: ["class", ".dark"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zenshin: {
          cream: "var(--zenshin-cream)",
          orange: "var(--zenshin-orange)",
          teal: "var(--zenshin-teal)",
          charcoal: "var(--zenshin-charcoal)",
          navy: "var(--zenshin-navy)",
        },
      },
      animation: {
        fadeIn: "fadeIn 0.4s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
