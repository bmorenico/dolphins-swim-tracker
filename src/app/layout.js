// src/app/layout.js
// The wrapper around every page in the app. Loads our fonts, the global
// stylesheet, and sets the browser-tab title. Runs on every screen.

import './globals.css';
import { Fredoka, Nunito } from 'next/font/google';

// Fredoka = big, friendly, rounded headings (the "playful" voice).
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fredoka',
});

// Nunito = clean, readable body text that's still warm.
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-nunito',
});

export const metadata = {
  title: 'Dulaney Dolphins Swim Tracker',
  description: "Francesca's swim meet progress tracker",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body style={{ fontFamily: 'var(--font-nunito), sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
