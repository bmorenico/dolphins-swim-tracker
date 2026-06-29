// src/app/add/page.js
// ADD A RESULT — the in-app manual entry form (no SQL needed).
// Lets you pick a swimmer, pick or create a meet, pick a standard event (or
// type a custom one), and enter her time + optional place + notes. On save it:
//   • auto-fills the league STR standard for the event (editable)
//   • detects a personal best, stamps is_personal_best + time_diff_vs_previous,
//     and clears the flag on her previous best for that event
//   • reuses the selected meet so multiple events from one day stay together
//
// Schema reference (Supabase):
//   swimmers(id, name, age, team, color, avatar_url, created_at)
//   meets(id, name, date, opponent, created_at)
//   results(id, swimmer_id, meet_id, event, stroke, distance_meters,
//           finals_time, seed_time, is_personal_best, time_diff_vs_previous,
//           str_standard_time, place, points, notes, created_at)
//   goals(id, swimmer_id, event, goal_time, created_at)

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

// Standard Girls 8 & Under individual events, with their stroke, distance,
// and official league STR standard times (seconds). Used to populate the
// dropdown and auto-fill STR. "Other" lets you type anything else.
const STANDARD_EVENTS = [
  { label: '25m Freestyle',    stroke: 'Freestyle',    distance: 25, str: 19.89 },
  { label: '25m Backstroke',   stroke: 'Backstroke',   distance: 25, str: 24.99 },
  { label: '25m Breaststroke', stroke: 'Breaststroke', distance: 25, str: 28.29 },
  { label: '25m Butterfly',    stroke: 'Butterfly',    distance: 25, str: 24.19 },
];

// Parse a typed time into seconds. Accepts "29.56", "29", or "1:05.30".
function parseTimeInput(str) {
  if (!str) return null;
  const t = String(str).trim();
  let value;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    value = parseInt(m, 10) * 60 + parseFloat(s);
  } else {
    value = parseFloat(t);
  }
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Pretty time label, e.g. 89.56 -> "1:29.56".
function formatTime(seconds) {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  if (mins === 0) return `${secs}`;
  return `${mins}:${secs.padStart(5, '0')}`;
}

export default function AddResultPage() {
  // Reference data
  const [swimmers, setSwimmers] = useState([]);
  const [meets, setMeets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [swimmerId, setSwimmerId] = useState('');
  const [meetMode, setMeetMode] = useState('existing'); // 'existing' | 'new'
  const [meetId, setMeetId] = useState('');
  const [newMeetName, setNewMeetName] = useState('');
  const [newMeetDate, setNewMeetDate] = useState('');
  const [newMeetOpponent, setNewMeetOpponent] = useState('');

  const [eventChoice, setEventChoice] = useState(''); // a STANDARD_EVENTS label or 'Other'
  const [customEvent, setCustomEvent] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [strStr, setStrStr] = useState('');
  const [placeStr, setPlaceStr] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // {message, isPB} success summary

  // ---- Load swimmers + meets; prefill swimmer from ?swimmer= if present ----
  useEffect(() => {
    async function load() {
      const [{ data: sw }, { data: mt }] = await Promise.all([
        supabase.from('swimmers').select('*').order('created_at', { ascending: true }),
        supabase.from('meets').select('*').order('date', { ascending: false }),
      ]);
      const swList = sw || [];
      setSwimmers(swList);
      setMeets(mt || []);

      // Prefill swimmer from URL (?swimmer=francesca) or default to first.
      let preset = null;
      if (typeof window !== 'undefined') {
        const slug = new URLSearchParams(window.location.search).get('swimmer');
        if (slug) {
          preset = swList.find(
            (s) => s.name.split(' ')[0].toLowerCase() === slug.toLowerCase()
          );
        }
      }
      setSwimmerId(preset ? preset.id : swList[0] ? swList[0].id : '');
      if (!(mt && mt.length)) setMeetMode('new'); // no meets yet -> start in "new"
      setLoading(false);
    }
    load();
  }, []);

  // When a standard event is chosen, auto-fill its STR standard (editable).
  function onEventChange(value) {
    setEventChoice(value);
    const std = STANDARD_EVENTS.find((e) => e.label === value);
    if (std) setStrStr(String(std.str));
    else setStrStr(''); // "Other" -> leave STR blank for you to fill if you want
  }

  // Resolve the final event name (handles the "Other" custom case).
  const eventName = eventChoice === 'Other' ? customEvent.trim() : eventChoice;

  // Is the form complete enough to save?
  const timeValue = parseTimeInput(timeStr);
  const meetReady =
    meetMode === 'existing' ? !!meetId : newMeetName.trim() && newMeetDate;
  const formReady = !!swimmerId && !!eventName && timeValue != null && meetReady;

  async function handleSave() {
    if (!formReady) return;
    setSaving(true);
    setResult(null);

    try {
      // 1) Resolve the meet — reuse an existing one or create a new row.
      let useMeetId = meetId;
      if (meetMode === 'new') {
        const { data: meetRow } = await supabase
          .from('meets')
          .insert({
            name: newMeetName.trim(),
            date: newMeetDate,
            opponent: newMeetOpponent.trim() || null,
          })
          .select()
          .single();
        useMeetId = meetRow.id;
      }

      // 2) Look at her existing swims of this event to detect a personal best.
      const { data: prior } = await supabase
        .from('results')
        .select('finals_time, is_personal_best, str_standard_time')
        .eq('swimmer_id', swimmerId)
        .eq('event', eventName);

      const priorTimes = (prior || []).map((r) => r.finals_time);
      const priorBest = priorTimes.length ? Math.min(...priorTimes) : null;
      const isPB = priorBest == null || timeValue < priorBest;
      const timeDiff = priorBest != null ? +(priorBest - timeValue).toFixed(2) : null;

      // STR: use what you typed, else carry forward from an existing result.
      const strValue =
        parseTimeInput(strStr) ??
        (prior || []).find((r) => r.str_standard_time != null)?.str_standard_time ??
        null;

      // Stroke + distance from the standard list (null for custom events).
      const std = STANDARD_EVENTS.find((e) => e.label === eventName);

      // 3) If this is a new best, clear the flag on her previous results.
      if (isPB && priorBest != null) {
        await supabase
          .from('results')
          .update({ is_personal_best: false })
          .eq('swimmer_id', swimmerId)
          .eq('event', eventName);
      }

      // 4) Insert the new result.
      await supabase.from('results').insert({
        swimmer_id: swimmerId,
        meet_id: useMeetId,
        event: eventName,
        stroke: std ? std.stroke : null,
        distance_meters: std ? std.distance : null,
        finals_time: timeValue,
        seed_time: null, // NT — we don't collect seed times in this form
        is_personal_best: isPB,
        time_diff_vs_previous: isPB ? timeDiff : null,
        str_standard_time: strValue,
        place: placeStr.trim() ? parseInt(placeStr, 10) : null,
        points: null,
        notes: notes.trim() || null,
      });

      // 5) Build a friendly success message.
      let message;
      if (isPB && priorBest == null) {
        message = `🌟 First time swimming ${eventName} — that's a personal best at ${formatTime(timeValue)}!`;
      } else if (isPB) {
        message = `🎉 New Personal Best! ${timeDiff.toFixed(2)} sec faster than her old best of ${formatTime(priorBest)}!`;
      } else {
        message = `✅ Saved! Her best ${eventName} stays ${formatTime(priorBest)}. Keep swimming! 🏊‍♀️`;
      }
      setResult({ message, isPB });

      // 6) Reset event/time/place/notes but KEEP swimmer + meet, so adding the
      //    next event from the same meet is quick. Refresh meets list too.
      setEventChoice('');
      setCustomEvent('');
      setTimeStr('');
      setStrStr('');
      setPlaceStr('');
      setNotes('');
      if (meetMode === 'new') {
        const { data: mt } = await supabase
          .from('meets')
          .select('*')
          .order('date', { ascending: false });
        setMeets(mt || []);
        setMeetMode('existing');
        setMeetId(useMeetId);
      }
    } catch (e) {
      setResult({ message: '⚠️ Something went wrong saving. Please try again.', isPB: false });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-splash-blue text-xl">Loading… 🏊‍♀️</p>
      </main>
    );
  }

  const inputClass =
    'w-full px-4 py-3 rounded-xl2 bg-navy-deep border border-splash-blue/40 ' +
    'text-white focus:outline-none focus:border-celebration-gold';
  const labelClass = 'block text-sm text-splash-blue mb-1';

  return (
    <main className="min-h-screen px-6 py-8 max-w-2xl mx-auto">
      <Link href="/" className="text-splash-blue hover:text-white">← Home</Link>

      <h1 className="mt-4 text-3xl text-celebration-gold font-heading">Add a Result 🏊‍♀️</h1>
      <p className="mt-1 text-splash-blue">Log a swim and we'll celebrate any new records!</p>

      {/* Success banner */}
      {result && (
        <div
          className={
            'mt-5 rounded-xl2 p-4 border ' +
            (result.isPB
              ? 'bg-celebration-gold/15 border-celebration-gold text-celebration-gold'
              : 'bg-dolphin-blue/15 border-dolphin-blue/50 text-splash-blue')
          }
        >
          <p className="font-heading">{result.message}</p>
        </div>
      )}

      <div className="mt-6 space-y-5">

        {/* Swimmer */}
        <div>
          <label className={labelClass}>Swimmer</label>
          <select
            value={swimmerId}
            onChange={(e) => setSwimmerId(e.target.value)}
            className={inputClass}
          >
            {swimmers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (age {s.age})
              </option>
            ))}
          </select>
        </div>

        {/* Meet: reuse existing or create new */}
        <div>
          <label className={labelClass}>Meet</label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setMeetMode('existing')}
              className={
                'px-4 py-2 rounded-xl2 font-heading text-sm transition-transform active:scale-95 ' +
                (meetMode === 'existing'
                  ? 'bg-dolphin-blue text-white'
                  : 'bg-navy-deep border border-splash-blue/40 text-splash-blue')
              }
              disabled={meets.length === 0}
            >
              Pick existing
            </button>
            <button
              type="button"
              onClick={() => setMeetMode('new')}
              className={
                'px-4 py-2 rounded-xl2 font-heading text-sm transition-transform active:scale-95 ' +
                (meetMode === 'new'
                  ? 'bg-dolphin-blue text-white'
                  : 'bg-navy-deep border border-splash-blue/40 text-splash-blue')
              }
            >
              ➕ New meet
            </button>
          </div>

          {meetMode === 'existing' ? (
            <select
              value={meetId}
              onChange={(e) => setMeetId(e.target.value)}
              className={inputClass}
            >
              <option value="">— choose a meet —</option>
              {meets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.date})
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Meet name (e.g. Dulaney vs Springlake)"
                value={newMeetName}
                onChange={(e) => setNewMeetName(e.target.value)}
                className={inputClass}
              />
              <input
                type="date"
                value={newMeetDate}
                onChange={(e) => setNewMeetDate(e.target.value)}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Opponent (optional)"
                value={newMeetOpponent}
                onChange={(e) => setNewMeetOpponent(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {/* Event */}
        <div>
          <label className={labelClass}>Event</label>
          <select
            value={eventChoice}
            onChange={(e) => onEventChange(e.target.value)}
            className={inputClass}
          >
            <option value="">— choose an event —</option>
            {STANDARD_EVENTS.map((e) => (
              <option key={e.label} value={e.label}>
                {e.label}
              </option>
            ))}
            <option value="Other">Other (type your own)…</option>
          </select>
          {eventChoice === 'Other' && (
            <input
              type="text"
              placeholder="Event name (e.g. 50m Freestyle)"
              value={customEvent}
              onChange={(e) => setCustomEvent(e.target.value)}
              className={inputClass + ' mt-2'}
            />
          )}
        </div>

        {/* Time (required) */}
        <div>
          <label className={labelClass}>Finals time (seconds, e.g. 29.56)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="29.56"
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            className={inputClass + ' text-2xl font-heading text-center'}
          />
        </div>

        {/* STR standard (auto-filled, editable, optional) */}
        <div>
          <label className={labelClass}>League standard / STR (optional, auto-filled)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 19.89"
            value={strStr}
            onChange={(e) => setStrStr(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Place + Notes */}
        <div>
          <label className={labelClass}>Place (optional, e.g. 19)</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="19"
            value={placeStr}
            onChange={(e) => setPlaceStr(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Notes (optional)</label>
          <textarea
            rows={2}
            placeholder="Great underwater dolphin kick! 🐬"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!formReady || saving}
          className="w-full px-6 py-4 rounded-xl2 bg-celebration-gold text-navy-deep text-lg
                     font-heading active:scale-95 transition-transform disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save result 🎉'}
        </button>

        <div className="pt-2 text-center">
          <Link href="/swimmer/francesca" className="text-dolphin-blue hover:text-white">
            View Francesca's profile →
          </Link>
        </div>
      </div>
    </main>
  );
}
