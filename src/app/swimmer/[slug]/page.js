// src/app/swimmer/[slug]/page.js
// SWIMMER PROFILE — loads a swimmer and their results live from Supabase and
// shows each event with the swim time plus a "progress toward STR standard"
// bar. The [slug] folder name makes this page handle /swimmer/francesca (and
// any future swimmer) using the name in the URL.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

// Turn raw seconds (e.g. 89.56) into a friendly time label (e.g. "1:29.56").
function formatTime(seconds) {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  if (mins === 0) return `${secs}`;
  return `${mins}:${secs.padStart(5, '0')}`;
}

export default function SwimmerProfile({ params }) {
  const { slug } = params;            // e.g. "francesca"
  const [swimmer, setSwimmer] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Match the URL slug to a swimmer by the first word of their name.
      // "francesca" -> finds "Francesca Corea".
      const { data: swimmers } = await supabase
        .from('swimmers')
        .select('*');

      const match = (swimmers || []).find(
        (s) => s.name.split(' ')[0].toLowerCase() === slug.toLowerCase()
      );

      if (match) {
        setSwimmer(match);
        const { data: res } = await supabase
          .from('results')
          .select('*')
          .eq('swimmer_id', match.id)
          .order('created_at', { ascending: true });
        setResults(res || []);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  // ---- Loading state ----
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-splash-blue text-xl">Loading… 🏊‍♀️</p>
      </main>
    );
  }

  // ---- Swimmer not found ----
  if (!swimmer) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-2xl text-celebration-gold font-heading">Swimmer not found</p>
        <Link href="/" className="mt-4 text-dolphin-blue underline">← Back home</Link>
      </main>
    );
  }

  // ---- Profile ----
  const firstName = swimmer.name.split(' ')[0];

  return (
    <main className="min-h-screen px-6 py-8 max-w-2xl mx-auto">

      {/* Back link */}
      <Link href="/" className="text-splash-blue hover:text-white">← Home</Link>

      {/* Header with avatar bubble + name */}
      <div className="mt-4 flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-dolphin-blue flex items-center
                        justify-center text-4xl text-celebration-gold font-heading shrink-0">
          {firstName[0]}
        </div>
        <div>
          <h1 className="text-3xl text-celebration-gold font-heading">{firstName}</h1>
          <p className="text-splash-blue">Age {swimmer.age} · {swimmer.team}</p>
        </div>
      </div>

      {/* Events */}
      <h2 className="mt-8 mb-4 text-xl text-silver-white font-heading">Her Events</h2>

      {results.length === 0 ? (
        <p className="text-splash-blue">No results yet — let's add her first swim! 🌟</p>
      ) : (
        <div className="space-y-4">
          {results.map((r) => {
            // Progress toward the STR standard. The STR is a faster (smaller)
            // target time, so progress = how far her time has closed the gap.
            // We show it as a friendly bar that fills as she approaches the goal.
            const hasStandard = r.str_standard_time != null;
            let pct = 0;
            if (hasStandard) {
              // Simple, kid-friendly ratio: standard / herTime, capped at 100%.
              pct = Math.min(100, Math.round((r.str_standard_time / r.finals_time) * 100));
            }

            return (
              <div key={r.id} className="bg-navy-deep border border-dolphin-blue/40
                                         rounded-xl2 p-5 shadow-lg">
                <div className="flex items-baseline justify-between">
                  <p className="text-lg text-white font-heading">{r.event}</p>
                  {r.is_personal_best && (
                    <span className="text-celebration-gold text-sm font-heading">★ Best</span>
                  )}
                </div>

                {/* Her time, big and proud */}
                <p className="mt-1 text-4xl text-splash-blue font-heading">
                  {formatTime(r.finals_time)}
                  <span className="text-base text-splash-blue/70 ml-1">sec</span>
                </p>

                {/* Progress toward STR standard */}
                {hasStandard && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-splash-blue mb-1">
                      <span>Goal time (STR): {formatTime(r.str_standard_time)}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-4 rounded-full bg-navy-deep border border-splash-blue/30 overflow-hidden">
                      <div
                        className="h-full bg-celebration-gold rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-splash-blue/70">
                      Getting closer to the standard time every swim! 🎯
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
