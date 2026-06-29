// src/app/layout.js
// The wrapper around every page in the app. Loads our fonts (via a simple
// stylesheet link so the build never depends on fetching them), pulls in the
// global stylesheet, and sets the browser-tab title. Runs on every screen.

import './globals.css';

export const metadata = {
  title: 'Dulaney Dolphins Swim Tracker',
  description: "Francesca's swim meet progress tracker",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Load our two fonts straight from Google Fonts in the browser.
            Fredoka = playful rounded headings. Nunito = clean body text. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Nunito', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
