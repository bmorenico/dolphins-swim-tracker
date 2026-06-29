// src/app/event/page.js
// EVENT DETAIL — one event's full history + progress chart for a swimmer.
// Reached via /event?swimmer=<slug>&event=<event name> (event is URL-encoded).
// Shows:
//   ⭐ her Personal Best for this event
//   📈 a recharts line chart of her times over meets (line DOWN = faster)
//   🎯 a goal reference line if she has a custom goal
//   a chronological list of every swim with date, meet, place, PB + diff
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

  useEffect(() => {
    // Read swimmer + event from the URL query string.
    const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const sSlug = qs ? qs.get('swimmer') || '' : '';
    const sEvent = qs ? qs.get('event') || '' : '';
    setSlug(sSlug);
    setEventName(sEvent);

    async function load() {
      // Find the swimmer by the first word of their name.
      const { data: swimmers } = await supabase.from('swimmers').select('*');
      const match = (swimmers || []).find(
        (s) => s.name.split(' ')[0].toLowerCase() === sSlug.toLowerCase()
      );
      if (!match) {
        setLoading(false);
        return;
      }
      setSwimmer(match);

      // Load her results for this event, the meets (for dates/names), and goal.
      const [{ data: res }, { data: meets }, { data: goals }] = await Promise.all([
        supabase
          .from('results')
          .select('*')
          .eq('swimmer_id', match.id)
          .eq('event', sEvent),
        supabase.from('meets').select('*'),
        supabase
          .from('goals')
          .select('*')
          .eq('swimmer_id', match.id)
          .eq('event', sEvent),
      ]);

      const meetById = {};
      (meets || []).forEach((m) => (meetById[m.id] = m));

      // Sort chronologically by meet date (fallback to created_at).
      const rows = (res || [])
        .map((r) => ({
          ...r,
          meet: meetById[r.meet_id] || null,
          date: meetById[r.meet_id]?.date || r.created_at,
        }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      // Mark the overall PB and the improvement vs her best-so-far.
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
      setLoading(false);
    }
    load();
  }, []);

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

  // Chart data + a zoomed y-axis range so her changes are easy to see.
  const chartData = swims.map((s) => ({
    label: shortDate(s.date),
    time: s.finals_time,
    isBest: s.isBest,
  }));
  const times = swims.map((s) => s.finals_time);
  const lowEnd = Math.min(...times, goalTime ?? Infinity);
  const yMin = Math.floor(lowEnd - 1);
  const yMax = Math.ceil(Math.max(...times) + 1);

  // Custom dot: gold + bigger for her personal best, splash-blue otherwise.
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
                <YAxis
                  domain={[yMin, yMax]}
                  stroke="#7ec8f0"
                  tick={{ fontSize: 12 }}
                  reversed={false}
                />
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

      {/* Full history list */}
      <h2 className="mt-8 mb-3 text-xl text-silver-white font-heading">Every Swim</h2>
      <div className="space-y-3">
        {[...swims].reverse().map((s) => (
          <div
            key={s.id}
            className={
              'rounded-xl2 p-4 border ' +
              (s.isBest
                ? 'bg-celebration-gold/10 border-celebration-gold'
                : 'bg-navy-deep border-dolphin-blue/40')
            }
          >
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
          </div>
        ))}
      </div>
    </main>
  );
}
