// src/app/swimmer/[slug]/page.js
// SWIMMER PROFILE — loads a swimmer, their results, and any custom goals live
// from Supabase. For each event it shows:
//   ⭐ Personal Best (her fastest time)  — the star, big and proud
//   🎯 Goal to chase — a custom target if set, otherwise "beat your PB"
//   League STR standard — shown small, as background context
// You can set / edit / clear a custom goal inline on each event card.
//
// Schema reference (Supabase):
//   swimmers(id, name, age, team, color, avatar_url, created_at)
//   results(id, swimmer_id, meet_id, event, stroke, distance_meters,
//           finals_time, seed_time, is_personal_best, time_diff_vs_previous,
//           str_standard_time, place, points, notes, created_at)
//   goals(id, swimmer_id, event, goal_time, created_at)  // one per (swimmer,event)
//           no row for an event => default goal is "beat your current PB"

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

// Parse a typed goal time into seconds. Accepts "28", "27.5", or "1:05.30".
// Returns a positive number, or null if it can't be understood.
function parseTimeInput(str) {
  if (!str) return null;
  const t = str.trim();
  let value;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    value = parseInt(m, 10) * 60 + parseFloat(s);
  } else {
    value = parseFloat(t);
  }
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default function SwimmerProfile({ params }) {
  const { slug } = params;            // e.g. "francesca"
  const [swimmer, setSwimmer] = useState(null);
  const [results, setResults] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Goal editor state
  const [editingEvent, setEditingEvent] = useState(null); // event name being edited
  const [goalInput, setGoalInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: swimmers } = await supabase.from('swimmers').select('*');
      const match = (swimmers || []).find(
        (s) => s.name.split(' ')[0].toLowerCase() === slug.toLowerCase()
      );

      if (match) {
        setSwimmer(match);
        const [{ data: res }, { data: gls }] = await Promise.all([
          supabase
            .from('results')
            .select('*')
            .eq('swimmer_id', match.id)
            .order('created_at', { ascending: true }),
          supabase.from('goals').select('*').eq('swimmer_id', match.id),
        ]);
        setResults(res || []);
        setGoals(gls || []);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  // Re-fetch just the goals after a change, so the cards update.
  async function reloadGoals() {
    if (!swimmer) return;
    const { data } = await supabase.from('goals').select('*').eq('swimmer_id', swimmer.id);
    setGoals(data || []);
  }

  // Open the inline editor for an event, prefilled with any existing goal.
  function openEditor(event, existingGoal) {
    setEditingEvent(event);
    setGoalInput(existingGoal != null ? String(existingGoal) : '');
  }

  function cancelEditor() {
    setEditingEvent(null);
    setGoalInput('');
  }

  // Save (create or update) a custom goal for this event.
  async function saveGoal(event) {
    const value = parseTimeInput(goalInput);
    if (value == null) return; // ignore unparseable input; placeholder guides them
    setSaving(true);
    await supabase
      .from('goals')
      .upsert(
        { swimmer_id: swimmer.id, event, goal_time: value },
        { onConflict: 'swimmer_id,event' }
      );
    await reloadGoals();
    setSaving(false);
    cancelEditor();
  }

  // Clear a custom goal -> the event falls back to the default "beat your PB".
  async function clearGoal(event) {
    setSaving(true);
    await supabase.from('goals').delete().eq('swimmer_id', swimmer.id).eq('event', event);
    await reloadGoals();
    setSaving(false);
    cancelEditor();
  }

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

  const firstName = swimmer.name.split(' ')[0];

  // ---- Build one summary per event from all her swims ----
  const byEvent = {};
  for (const r of results) {
    (byEvent[r.event] ||= []).push(r);
  }

  const events = Object.entries(byEvent).map(([event, rows]) => {
    const pb = Math.min(...rows.map((r) => r.finals_time)); // fastest = personal best
    const start = rows[0].finals_time;                      // her first swim of this event
    const swims = rows.length;
    const str =
      rows.find((r) => r.str_standard_time != null)?.str_standard_time ?? null;
    const goalRow = goals.find((g) => g.event === event);
    const customGoal = goalRow ? goalRow.goal_time : null;  // null => default "beat your PB"
    return { event, pb, start, swims, str, customGoal };
  });

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

      {events.length === 0 ? (
        <p className="text-splash-blue">No results yet — let's add her first swim! 🌟</p>
      ) : (
        <div className="space-y-4">
          {events.map((ev) => {
            const isCustom = ev.customGoal != null;
            const reached = isCustom && ev.pb <= ev.customGoal;
            const toGo = isCustom ? ev.pb - ev.customGoal : 0;
            const isEditing = editingEvent === ev.event;

            // Progress bar (custom goal not yet reached): how far she's come
            // from her FIRST swim toward the goal time.
            let pct = 0;
            if (isCustom && !reached) {
              const denom = ev.start - ev.customGoal;
              pct =
                denom > 0
                  ? Math.max(0, Math.min(100, Math.round(((ev.start - ev.pb) / denom) * 100)))
                  : 0;
            }

            return (
              <div
                key={ev.event}
                className="bg-navy-deep border border-dolphin-blue/40 rounded-xl2 p-5 shadow-lg"
              >
                {/* Event name + swim count */}
                <div className="flex items-baseline justify-between">
                  <p className="text-lg text-white font-heading">{ev.event}</p>
                  <span className="text-xs text-splash-blue/70">
                    {ev.swims} {ev.swims === 1 ? 'swim' : 'swims'}
                  </span>
                </div>

                {/* ⭐ Personal Best — the star */}
                <p className="mt-1 text-xs text-celebration-gold font-heading tracking-wide">
                  ⭐ PERSONAL BEST
                </p>
                <p className="text-5xl text-splash-blue font-heading leading-tight">
                  {formatTime(ev.pb)}
                  <span className="text-base text-splash-blue/70 ml-1">sec</span>
                </p>

                {/* 🎯 Goal to chase */}
                <div className="mt-4">
                  {!isCustom ? (
                    <p className="text-sm text-celebration-gold">
                      ⭐ Her best yet! Beat {formatTime(ev.pb)} next time to set a NEW record! 🎉
                    </p>
                  ) : reached ? (
                    <p className="text-sm text-celebration-gold font-heading">
                      🎯 Goal smashed! {Math.abs(toGo).toFixed(2)} sec under {formatTime(ev.customGoal)}! 🎉
                    </p>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm text-splash-blue mb-1">
                        <span>🎯 Goal: {formatTime(ev.customGoal)}</span>
                        <span className="text-celebration-gold font-heading">
                          {toGo.toFixed(2)} sec to go!
                        </span>
                      </div>
                      <div className="w-full h-4 rounded-full bg-navy-deep border border-splash-blue/30 overflow-hidden">
                        <div
                          className="h-full bg-celebration-gold rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-splash-blue/70">
                        {pct > 0
                          ? `${pct}% of the way to your goal — keep swimming! 🏊‍♀️`
                          : 'Right at the starting line — every swim gets you closer! 🌱'}
                      </p>
                    </>
                  )}
                </div>

                {/* Goal editor / buttons */}
                {!isEditing ? (
                  <button
                    onClick={() => openEditor(ev.event, ev.customGoal)}
                    className="mt-3 text-sm text-dolphin-blue hover:text-white font-heading"
                  >
                    {isCustom ? '✏️ Edit goal' : '🎯 Set a goal'}
                  </button>
                ) : (
                  <div className="mt-3 bg-navy-deep/60 border border-dolphin-blue/40 rounded-xl2 p-4">
                    <label className="block text-sm text-splash-blue mb-2">
                      Goal time in seconds (e.g. {ev.pb.toFixed(2)} or faster)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      placeholder={`${ev.pb.toFixed(2)}`}
                      className="w-full px-4 py-3 rounded-xl2 bg-navy-deep border border-splash-blue/40
                                 text-2xl text-white font-heading text-center
                                 focus:outline-none focus:border-celebration-gold"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => saveGoal(ev.event)}
                        disabled={saving || parseTimeInput(goalInput) == null}
                        className="px-5 py-3 rounded-xl2 bg-celebration-gold text-navy-deep font-heading
                                   active:scale-95 transition-transform disabled:opacity-40"
                      >
                        {saving ? 'Saving…' : 'Save goal'}
                      </button>
                      {isCustom && (
                        <button
                          onClick={() => clearGoal(ev.event)}
                          disabled={saving}
                          className="px-5 py-3 rounded-xl2 bg-navy-deep border border-splash-blue/40
                                     text-splash-blue font-heading active:scale-95 transition-transform"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        onClick={cancelEditor}
                        disabled={saving}
                        className="px-5 py-3 rounded-xl2 text-splash-blue/70 font-heading
                                   active:scale-95 transition-transform"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* League STR standard — small background context */}
                {ev.str != null && (
                  <p className="mt-3 text-xs text-splash-blue/50">
                    League standard (STR): {formatTime(ev.str)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
