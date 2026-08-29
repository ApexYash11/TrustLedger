/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        card: "0 1px 2px rgba(15,15,15,0.04), 0 2px 4px rgba(15,15,15,0.04)",
        pop: "0 4px 12px rgba(15,15,15,0.08), 0 1px 3px rgba(15,15,15,0.06)",
      },
    },
  },
  plugins: [],
};
