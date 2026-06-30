// src/app/event/page.js
// EVENT DETAIL — one event's full history + progress chart for a swimmer.
// Reached via /event?swimmer=<slug>&event=<event name> (event is URL-encoded).
// Shows:
//   ⭐ her Personal Best for this event
//   📈 a recharts line chart of her times over meets (line DOWN = faster)
//   🎯 a goal reference line if she has a custom goal
//   a chronological list of every swim with date, meet, place, PB + diff
//   ✏️ inline EDIT (time / place / notes) and 🗑️ DELETE for each swim,
//      with automatic personal-best re-check after any change.
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
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { supabase } from '../../lib/supabase';

// Pretty time label, e.g. 89.56 -> "1:29.56".
function formatTime(seconds) {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  if (mins === 0) return `${secs}`;
  return `${mins}:${secs.padStart(5, '0')}`;
}

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

// "2026-06-27" -> "6/27"
function shortDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export default function EventDetailPage() {
  const [slug, setSlug] = useState('');
  const [eventName, setEventName] = useState('');
  const [swimmer, setSwimmer] = useState(null);
  const [swims, setSwims] = useState([]);   // chronological, with meet + isPB + diff
  const [goalTime, setGoalTime] = useState(null);
  const [strTime, setStrTime] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit / delete state
  const [editingId, setEditingId] = useState(null);
  const [editTime, setEditTime] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [confirmId, setConfirmId] = useState(null); // delete confirmation
  const [busy, setBusy] = useState(false);

  // Load (or reload) everything for a given swimmer + event.
  async function loadData(match, evName) {
    const [{ data: res }, { data: meets }, { data: goals }] = await Promise.all([
      supabase.from('results').select('*').eq('swimmer_id', match.id).eq('event', evName),
      supabase.from('meets').select('*'),
      supabase.from('goals').select('*').eq('swimmer_id', match.id).eq('event', evName),
    ]);

    const meetById = {};
    (meets || []).forEach((m) => (meetById[m.id] = m));

    const rows = (res || [])
      .map((r) => ({
        ...r,
        meet: meetById[r.meet_id] || null,
        date: meetById[r.meet_id]?.date || r.created_at,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const best = rows.length ? Math.min(...rows.map((r) => r.finals_time)) : null;
    let runningBest = null;
    const enriched = rows.map((r) => {
      const improved = runningBest != null && r.finals_time < runningBest;
      const diff = improved ? +(runningBest - r.finals_time).toFixed(2) : null;
      if (runningBest == null || r.finals_time < runningBest) runningBest = r.finals_time;
      return { ...r, isBest: r.finals_time === best, diff };
    });

    setSwims(enriched);
    setGoalTime(goals && goals.length ? goals[0].goal_time : null);
    setStrTime(rows.find((r) => r.str_standard_time != null)?.str_standard_time ?? null);
  }

  useEffect(() => {
    const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const sSlug = qs ? qs.get('swimmer') || '' : '';
    const sEvent = qs ? qs.get('event') || '' : '';
    setSlug(sSlug);
    setEventName(sEvent);

    async function init() {
      const { data: swimmers } = await supabase.from('swimmers').select('*');
      const match = (swimmers || []).find(
        (s) => s.name.split(' ')[0].toLowerCase() === sSlug.toLowerCase()
      );
      if (!match) {
        setLoading(false);
        return;
      }
      setSwimmer(match);
      await loadData(match, sEvent);
      setLoading(false);
    }
    init();
  }, []);

  // After any edit/delete, re-stamp which swim is the personal best.
  async function restampPB(evName) {
    const { data } = await supabase
      .from('results')
      .select('id, finals_time, created_at')
      .eq('swimmer_id', swimmer.id)
      .eq('event', evName);
    if (!data || data.length === 0) return;
    const winner = [...data].sort(
      (a, b) =>
        a.finals_time - b.finals_time ||
        (a.created_at < b.created_at ? -1 : 1)
    )[0];
    await supabase
      .from('results')
      .update({ is_personal_best: false })
      .eq('swimmer_id', swimmer.id)
      .eq('event', evName);
    await supabase.from('results').update({ is_personal_best: true }).eq('id', winner.id);
  }

  function startEdit(s) {
    setConfirmId(null);
    setEditingId(s.id);
    setEditTime(String(s.finals_time));
    setEditPlace(s.place != null ? String(s.place) : '');
    setEditNotes(s.notes || '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTime('');
    setEditPlace('');
    setEditNotes('');
  }

  async function saveEdit(s) {
    const t = parseTimeInput(editTime);
    if (t == null) return; // ignore unparseable time
    setBusy(true);
    await supabase
      .from('results')
      .update({
        finals_time: t,
        place: editPlace.trim() ? parseInt(editPlace, 10) : null,
        notes: editNotes.trim() || null,
      })
      .eq('id', s.id);
    await restampPB(eventName);
    await loadData(swimmer, eventName);
    setBusy(false);
    cancelEdit();
  }

  async function doDelete(id) {
    setBusy(true);
    await supabase.from('results').delete().eq('id', id);
    await restampPB(eventName);
    await loadData(swimmer, eventName);
    setBusy(false);
    setConfirmId(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-splash-blue text-xl">Loading… 🏊‍♀️</p>
      </main>
    );
  }

  if (!swimmer || swims.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-2xl text-celebration-gold font-heading">No swims found</p>
        <p className="mt-2 text-splash-blue">{eventName || 'this event'}</p>
        <Link href={`/swimmer/${slug || 'francesca'}`} className="mt-4 text-dolphin-blue underline">
          ← Back to profile
        </Link>
      </main>
    );
  }

  const firstName = swimmer.name.split(' ')[0];
  const pb = Math.min(...swims.map((s) => s.finals_time));

  const chartData = swims.map((s) => ({
    label: shortDate(s.date),
    time: s.finals_time,
    isBest: s.isBest,
  }));
  const times = swims.map((s) => s.finals_time);
  const lowEnd = Math.min(...times, goalTime ?? Infinity);
  const yMin = Math.floor(lowEnd - 1);
  const yMax = Math.ceil(Math.max(...times) + 1);

  const renderDot = (props) => {
    const { cx, cy, payload } = props;
    const best = payload.isBest;
    return (
      <circle
        key={`${cx}-${cy}`}
        cx={cx}
        cy={cy}
        r={best ? 7 : 5}
        fill={best ? '#ffc94d' : '#7ec8f0'}
        stroke="#0a2a5e"
        strokeWidth={2}
      />
    );
  };

  const editInput =
    'w-full px-3 py-2 rounded-xl2 bg-navy-deep border border-splash-blue/40 ' +
    'text-white focus:outline-none focus:border-celebration-gold';

  return (
    <main className="min-h-screen px-6 py-8 max-w-2xl mx-auto">
      <Link href={`/swimmer/${slug}`} className="text-splash-blue hover:text-white">
        ← {firstName}'s profile
      </Link>

      <h1 className="mt-4 text-3xl text-celebration-gold font-heading">{eventName}</h1>
      <p className="mt-1 text-splash-blue">{firstName}'s progress</p>

      {/* Personal best headline */}
      <div className="mt-5 bg-navy-deep border border-dolphin-blue/40 rounded-xl2 p-5">
        <p className="text-xs text-celebration-gold font-heading tracking-wide">⭐ PERSONAL BEST</p>
        <p className="text-5xl text-splash-blue font-heading leading-tight">
          {formatTime(pb)}
          <span className="text-base text-splash-blue/70 ml-1">sec</span>
        </p>
        <p className="mt-1 text-sm text-splash-blue/70">
          {swims.length} {swims.length === 1 ? 'swim' : 'swims'} recorded
        </p>
      </div>

      {/* Progress chart (needs at least 2 swims to draw a line) */}
      {swims.length >= 2 ? (
        <div className="mt-6 bg-navy-deep border border-dolphin-blue/40 rounded-xl2 p-4">
          <p className="text-sm text-silver-white font-heading mb-1">📈 Her progress</p>
          <p className="text-xs text-splash-blue/70 mb-3">
            When the line goes <span className="text-celebration-gold">down ⬇️</span>, she's swimming faster!
          </p>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2b8cde33" />
                <XAxis dataKey="label" stroke="#7ec8f0" tick={{ fontSize: 12 }} />
                <YAxis domain={[yMin, yMax]} stroke="#7ec8f0" tick={{ fontSize: 12 }} reversed={false} />
                <Tooltip
                  contentStyle={{
                    background: '#0a2a5e',
                    border: '1px solid #2b8cde',
                    borderRadius: 12,
                    color: '#f0f4f8',
                  }}
                  formatter={(value) => [`${formatTime(value)} sec`, 'Time']}
                />
                {goalTime != null && (
                  <ReferenceLine
                    y={goalTime}
                    stroke="#ffc94d"
                    strokeDasharray="5 4"
                    label={{ value: `🎯 Goal ${formatTime(goalTime)}`, fill: '#ffc94d', fontSize: 11, position: 'insideTopRight' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="time"
                  stroke="#2b8cde"
                  strokeWidth={3}
                  dot={renderDot}
                  activeDot={{ r: 8 }}
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {strTime != null && (
            <p className="mt-2 text-xs text-splash-blue/50">
              League standard (STR) for this event: {formatTime(strTime)}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 bg-navy-deep border border-dolphin-blue/40 rounded-xl2 p-5 text-center">
          <p className="text-splash-blue">
            🌱 This is her first swim in this event! Add another to start her progress line. 📈
          </p>
          {strTime != null && (
            <p className="mt-2 text-xs text-splash-blue/50">
              League standard (STR): {formatTime(strTime)}
            </p>
          )}
        </div>
      )}

      {/* Full history list with edit / delete */}
      <h2 className="mt-8 mb-3 text-xl text-silver-white font-heading">Every Swim</h2>
      <div className="space-y-3">
        {[...swims].reverse().map((s) => {
          const isEditing = editingId === s.id;
          const isConfirming = confirmId === s.id;

          return (
            <div
              key={s.id}
              className={
                'rounded-xl2 p-4 border ' +
                (s.isBest
                  ? 'bg-celebration-gold/10 border-celebration-gold'
                  : 'bg-navy-deep border-dolphin-blue/40')
              }
            >
              {!isEditing ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <p className="text-2xl text-white font-heading">
                      {formatTime(s.finals_time)}
                      <span className="text-sm text-splash-blue/70 ml-1">sec</span>
                      {s.isBest && <span className="ml-2 text-celebration-gold text-base">⭐ PB</span>}
                    </p>
                    <span className="text-xs text-splash-blue/70">{shortDate(s.date)}</span>
                  </div>
                  <p className="mt-1 text-sm text-splash-blue">
                    {s.meet ? s.meet.name : 'Meet'}
                    {s.place ? ` · Place ${s.place}` : ''}
                  </p>
                  {s.diff != null && (
                    <p className="mt-1 text-sm text-celebration-gold">
                      {s.diff.toFixed(2)} sec faster than before! 🎉
                    </p>
                  )}
                  {s.notes && <p className="mt-1 text-sm text-splash-blue/80 italic">“{s.notes}”</p>}

                  {/* Edit / delete controls */}
                  {!isConfirming ? (
                    <div className="mt-3 flex gap-4">
                      <button
                        onClick={() => startEdit(s)}
                        className="text-sm text-dolphin-blue hover:text-white font-heading"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setConfirmId(s.id); }}
                        className="text-sm text-splash-blue/70 hover:text-white font-heading"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-sm text-splash-blue">Delete this swim?</span>
                      <button
                        onClick={() => doDelete(s.id)}
                        disabled={busy}
                        className="px-4 py-2 rounded-xl2 bg-red-500/80 text-white text-sm font-heading active:scale-95 transition-transform"
                      >
                        {busy ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        disabled={busy}
                        className="px-4 py-2 rounded-xl2 text-splash-blue/70 text-sm font-heading"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* ---- EDIT MODE ---- */
                <div className="space-y-3">
                  <p className="text-xs text-splash-blue/70">
                    {s.meet ? s.meet.name : 'Meet'} · {shortDate(s.date)}
                  </p>
                  <div>
                    <label className="block text-xs text-splash-blue mb-1">Time (seconds)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className={editInput + ' text-xl font-heading text-center'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-splash-blue mb-1">Place (optional)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editPlace}
                      onChange={(e) => setEditPlace(e.target.value)}
                      className={editInput}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-splash-blue mb-1">Notes (optional)</label>
                    <textarea
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className={editInput}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(s)}
                      disabled={busy || parseTimeInput(editTime) == null}
                      className="px-5 py-2 rounded-xl2 bg-celebration-gold text-navy-deep font-heading active:scale-95 transition-transform disabled:opacity-40"
                    >
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={busy}
                      className="px-5 py-2 rounded-xl2 text-splash-blue/70 font-heading"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
