// src/components/MediaGallery.js
// MEDIA GALLERY — photos, GIFs, and videos attached to a swim (result) or meet.
// Photos/GIFs come from UNLISTED Google Drive links; videos from UNLISTED
// YouTube links. Nothing is publicly listed — only reachable via these links.
//
// Pass exactly ONE of: resultId  (attach to a single swim)
//                      meetId    (attach to a whole meet)
//
// Schema reference (Supabase):
//   media(id, result_id, meet_id, media_type 'photo'|'gif'|'video',
//         url, caption, thumbnail_url, created_at)
//   (RLS is ON with an open allow-all policy, created with the original schema.)

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Pull a YouTube video id out of any common link shape.
function parseYouTubeId(url) {
  const m = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}

// Pull a Google Drive file id out of any common link shape.
function parseDriveId(url) {
  let m = String(url).match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = String(url).match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  m = String(url).match(/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

// Guess the media type from a pasted URL (user can still override).
function guessType(url) {
  if (parseYouTubeId(url)) return 'video';
  if (/\.gif(\?|$)/i.test(url)) return 'gif';
  return 'photo';
}

// ---- A single Drive/direct image with a graceful fallback chain ----
function MediaImage({ url, caption }) {
  const driveId = parseDriveId(url);
  const candidates = driveId
    ? [
        `https://lh3.googleusercontent.com/d/${driveId}=w1200`,
        `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`,
      ]
    : [url];
  const [idx, setIdx] = useState(0);

  if (idx >= candidates.length) {
    return (
      
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block text-center text-sm text-dolphin-blue underline p-4"
      >
        Open photo ↗
      </a>
    );
  }

  return (
    <img
      src={candidates[idx]}
      alt={caption || 'swim photo'}
      onError={() => setIdx((i) => i + 1)}
      className="w-full h-40 object-cover"
      loading="lazy"
    />
  );
}

// ---- A YouTube video: thumbnail until tapped, then an inline player ----
function MediaVideo({ url, caption }) {
  const id = parseYouTubeId(url);
  const [playing, setPlaying] = useState(false);

  if (!id) {
    return (
      
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block text-center text-sm text-dolphin-blue underline p-4"
      >
        Open video ↗
      </a>
    );
  }

  if (playing) {
    return (
      <div className="w-full" style={{ aspectRatio: '16 / 9' }}>
        <iframe
          src={`https://www.youtube.com/embed/${id}?autoplay=1`}
          title={caption || 'swim video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
          style={{ border: 0 }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="relative block w-full h-40 group"
    >
      <img
        src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
        alt={caption || 'swim video'}
        className="w-full h-40 object-cover"
        loading="lazy"
      />
      <span
        className="absolute inset-0 flex items-center justify-center text-4xl
                   bg-navy-deep/30 group-active:scale-95 transition-transform"
      >
        ▶️
      </span>
    </button>
  );
}

export default function MediaGallery({ resultId = null, meetId = null }) {
  const column = resultId ? 'result_id' : 'meet_id';
  const value = resultId || meetId;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Add-form state
  const [url, setUrl] = useState('');
  const [type, setType] = useState('photo');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  async function load() {
    if (!value) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('media')
      .select('*')
      .eq(column, value)
      .order('created_at', { ascending: true });
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Keep the type dropdown smart as the user pastes a link.
  function onUrlChange(v) {
    setUrl(v);
    setType(guessType(v));
  }

  async function addMedia() {
    if (!url.trim() || !value) return;
    setBusy(true);
    await supabase.from('media').insert({
      result_id: resultId,
      meet_id: meetId,
      media_type: type,
      url: url.trim(),
      caption: caption.trim() || null,
      thumbnail_url: null,
    });
    setBusy(false);
    setUrl('');
    setCaption('');
    setType('photo');
    setAdding(false);
    load();
  }

  async function removeMedia(id) {
    setBusy(true);
    await supabase.from('media').delete().eq('id', id);
    setBusy(false);
    setConfirmId(null);
    load();
  }

  const inputClass =
    'w-full px-3 py-2 rounded-xl2 bg-navy-deep border border-splash-blue/40 ' +
    'text-white text-sm focus:outline-none focus:border-celebration-gold';

  return (
    <div className="mt-3 pt-3 border-t border-splash-blue/20">
      <div className="flex items-center justify-between">
        <p className="text-sm text-splash-blue font-heading">
          📸 Photos &amp; video{items.length ? ` (${items.length})` : ''}
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm text-dolphin-blue hover:text-white font-heading"
          >
            ➕ Add
          </button>
        )}
      </div>

      {/* Gallery grid */}
      {!loading && items.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((m) => (
            <div
              key={m.id}
              className="rounded-xl2 overflow-hidden border border-dolphin-blue/40 bg-navy-deep"
            >
              {m.media_type === 'video' ? (
                <MediaVideo url={m.url} caption={m.caption} />
              ) : (
                <MediaImage url={m.url} caption={m.caption} />
              )}
              {m.caption && (
                <p className="px-2 py-1 text-xs text-splash-blue/80 truncate">{m.caption}</p>
              )}
              {confirmId === m.id ? (
                <div className="flex items-center justify-between px-2 py-1 gap-2">
                  <button
                    onClick={() => removeMedia(m.id)}
                    disabled={busy}
                    className="text-xs text-red-300 font-heading"
                  >
                    {busy ? '…' : 'Delete?'}
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="text-xs text-splash-blue/70 font-heading"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(m.id)}
                  className="w-full px-2 py-1 text-xs text-splash-blue/50 hover:text-white text-right"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="mt-3 bg-navy-deep/60 border border-dolphin-blue/40 rounded-xl2 p-3 space-y-2">
          <input
            type="text"
            placeholder="Paste an unlisted Google Drive or YouTube link"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            className={inputClass}
          />
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass + ' flex-1'}
            >
              <option value="photo">Photo</option>
              <option value="gif">GIF</option>
              <option value="video">Video (YouTube)</option>
            </select>
            <input
              type="text"
              placeholder="Caption (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className={inputClass + ' flex-1'}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addMedia}
              disabled={busy || !url.trim()}
              className="px-4 py-2 rounded-xl2 bg-celebration-gold text-navy-deep text-sm
                         font-heading active:scale-95 transition-transform disabled:opacity-40"
            >
              {busy ? 'Adding…' : 'Add media'}
            </button>
            <button
              onClick={() => { setAdding(false); setUrl(''); setCaption(''); }}
              disabled={busy}
              className="px-4 py-2 rounded-xl2 text-splash-blue/70 text-sm font-heading"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-splash-blue/50">
            Tip: in Google Drive, set the file to “Anyone with the link”. In YouTube, set the video to “Unlisted”.
          </p>
        </div>
      )}
    </div>
  );
}
