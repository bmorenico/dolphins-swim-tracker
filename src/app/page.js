// src/app/page.js
// HOME SCREEN — the first thing you see. Shows the Dulaney Dolphin logo,
// a big warm welcome, and a tappable card for Francesca that links to her
// profile page (built next). Uses our dolphin-blue palette + playful fonts.

import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-10">

      {/* ---- Logo, front and center ---- */}
      <Image
        src="/DSC_Dolphins_Logo.png"
        alt="Dulaney Swim Club Dolphins logo"
        width={220}
        height={220}
        priority
        className="drop-shadow-lg"
      />

      {/* ---- Big playful welcome ---- */}
      <h1
        className="mt-6 text-4xl md:text-5xl text-center text-celebration-gold"
        style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 700 }}
      >
        Dolphins Swim Tracker
      </h1>
      <p className="mt-3 text-lg md:text-xl text-splash-blue text-center">
        Watch your times splash down and your records soar! 🐬
      </p>

      {/* ---- Swimmer card (tap to open profile) ---- */}
      <div className="mt-10 w-full max-w-md">
        <h2
          className="text-xl mb-3 text-silver-white"
          style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 600 }}
        >
          Swimmers
        </h2>

        <Link href="/swimmer/francesca">
          <div className="bg-dolphin-blue rounded-xl2 p-6 flex items-center gap-4
                          shadow-lg active:scale-95 transition-transform cursor-pointer">
            {/* Round avatar bubble with her first initial */}
            <div className="w-16 h-16 rounded-full bg-navy-deep flex items-center
                            justify-center text-3xl text-celebration-gold shrink-0"
                 style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 700 }}>
              F
            </div>
            <div>
              <p className="text-2xl text-white"
                 style={{ fontFamily: 'var(--font-fredoka)', fontWeight: 600 }}>
                Francesca
              </p>
              <p className="text-splash-blue">Age 8 · Dulaney Dolphins</p>
            </div>
            <span className="ml-auto text-2xl text-white">→</span>
          </div>
        </Link>
      </div>

      {/* ---- Footer note ---- */}
      <p className="mt-auto pt-10 text-sm text-splash-blue/70 text-center">
        Go Dolphins! 🏊‍♀️
      </p>
    </main>
  );
}
