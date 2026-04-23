// youtube_kinds.js — YouTube entry kind vocabulary (ADR-077).
// Mirror of carnatic/render/youtube_kinds.py. Keep the two files in sync.
//
// The default kind (field absent) is treated as "recital" everywhere downstream.
// Storage prefers omission over writing "recital" explicitly.
window.YOUTUBE_KINDS = [
  'recital',
  'lecdem',
];
