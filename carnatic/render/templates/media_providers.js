// media_providers.js — Source-agnostic media provider registry (ADR-154).
// Mirror of carnatic/render/media_providers.py. Keep the two files in sync.
//
// parseMediaUrl(url) → MediaRef { provider, provider_id, url, start, controllable }
//                      or null when no provider matches.
// mediaKey(ref)      → "provider:provider_id" — replaces the bare YouTube `vid`.
// embedSource(ref)   → a Plyr source descriptor (consumed by the player, ADR-155).
(function () {
  'use strict';

  const T_HMS = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

  function parseStart(url) {
    let raw = null;
    const q = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
    const params = new URLSearchParams(q);
    if (params.has('t')) raw = params.get('t');
    else if (params.has('start')) raw = params.get('start');
    if (raw === null) {
      const hash = url.indexOf('#') >= 0 ? url.slice(url.indexOf('#') + 1) : '';
      if (hash.indexOf('t=') === 0) raw = hash.slice(2);
    }
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    const m = T_HMS.exec(raw);
    if (m && (m[1] || m[2] || m[3])) {
      return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
    }
    return 0;
  }

  const YT_ID = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/;
  const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/;
  const GDRIVE_ID = /\/file\/d\/([A-Za-z0-9_-]+)|[?&]id=([A-Za-z0-9_-]+)/;
  const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.flac', '.aac'];
  const VIDEO_EXT = ['.mp4', '.webm', '.ogv', '.mov', '.m4v'];

  function pathname(url) {
    try { return new URL(url).pathname.toLowerCase(); }
    catch (e) { return url.toLowerCase(); }
  }
  function endsWithAny(path, exts) { return exts.some(function (e) { return path.endsWith(e); }); }

  // Order matters: first match wins; file providers are broadest, so last.
  const PROVIDERS = [
    { provider: 'youtube',    controllable: true,  extract: function (u) { const m = YT_ID.exec(u); return m ? m[1] : null; } },
    { provider: 'vimeo',      controllable: true,  extract: function (u) { const m = VIMEO_ID.exec(u); return m ? m[1] : null; } },
    { provider: 'soundcloud', controllable: false, extract: function (u) {
        if (u.indexOf('soundcloud.com/') < 0) return null;
        try { return new URL(u).pathname.replace(/^\/+|\/+$/g, '') || null; } catch (e) { return null; }
      } },
    { provider: 'gdrive',     controllable: false, extract: function (u) {
        if (u.indexOf('drive.google.com') < 0 && u.indexOf('docs.google.com') < 0) return null;
        const m = GDRIVE_ID.exec(u); return m ? (m[1] || m[2]) : null;
      } },
    { provider: 'audio',      controllable: true,  extract: function (u) { return endsWithAny(pathname(u), AUDIO_EXT) ? u : null; } },
    { provider: 'video',      controllable: true,  extract: function (u) { return endsWithAny(pathname(u), VIDEO_EXT) ? u : null; } },
  ];

  function parseMediaUrl(url) {
    if (!url) return null;
    for (let i = 0; i < PROVIDERS.length; i++) {
      const pid = PROVIDERS[i].extract(url);
      if (pid) {
        return {
          provider:     PROVIDERS[i].provider,
          provider_id:  pid,
          url:          url,
          start:        parseStart(url),
          controllable: PROVIDERS[i].controllable,
        };
      }
    }
    return null;
  }

  function mediaKey(ref) {
    if (!ref || !ref.provider || !ref.provider_id) return null;
    return ref.provider + ':' + ref.provider_id;
  }

  // Plyr source descriptor per provider (ADR-155). For non-controllable providers
  // the player layer falls back to a native embed; this returns null for them.
  function embedSource(ref) {
    if (!ref) return null;
    switch (ref.provider) {
      case 'youtube': return { type: 'video', sources: [{ src: ref.provider_id, provider: 'youtube' }] };
      case 'vimeo':   return { type: 'video', sources: [{ src: ref.provider_id, provider: 'vimeo' }] };
      case 'audio':   return { type: 'audio', sources: [{ src: ref.url }] };
      case 'video':   return { type: 'video', sources: [{ src: ref.url }] };
      default:        return null; // soundcloud, gdrive — native embed (ADR-155 §4)
    }
  }

  window.parseMediaUrl = parseMediaUrl;
  window.mediaKey = mediaKey;
  window.embedSource = embedSource;
})();
