// tailwind.config.js
// Styling configuration for the Dolphins Swim Tracker.
// Registers Francesca's dolphin-logo color palette so we can use names
// like `bg-navy-deep` or `text-celebration-gold` throughout the app.

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ----- Dulaney Dolphins palette (pulled from the logo) -----
        'navy-deep':        '#0a2a5e', // backgrounds, headers, anchor color
        'dolphin-blue':     '#2b8cde', // buttons, links, highlights
        'splash-blue':      '#7ec8f0', // accents, progress bars, fun touches
        'silver-white':     '#f0f4f8', // light text, clean space
        'celebration-gold': '#ffc94d', // PBs, badges, celebration moments
      },
      borderRadius: {
        // chunky, kid-friendly rounded corners
        'xl2': '1.25rem',
      },
    },
  },
  plugins: [],
};
