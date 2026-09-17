/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        border: "var(--border)",
        hover: "var(--hover)",
        ink: {
          DEFAULT: "var(--ink)",
          fg: "var(--ink-fg)",
        },
        text: {
          DEFAULT: "var(--text)",
          2: "var(--text-2)",
          3: "var(--text-3)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          2: "var(--muted-2)",
        },
        faint: "var(--faint)",
        ok: { DEFAULT: "var(--ok)", soft: "var(--ok-soft)", line: "var(--ok-line)" },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)", line: "var(--info-line)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)", line: "var(--warn-line)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)", line: "var(--danger-line)" },
        neutral: { DEFAULT: "var(--neutral)", soft: "var(--neutral-soft)", line: "var(--neutral-line)" },
      },
      fontFamily: {
        sans: ['"Instrument Sans"', "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(35, 33, 30, 0.03)",
        "card-hover": "0 4px 14px rgba(35, 33, 30, 0.09)",
        pop: "0 4px 12px rgba(28, 27, 26, 0.1), 0 1px 3px rgba(28, 27, 26, 0.06)",
      },
    },
  },
  plugins: [],
};
