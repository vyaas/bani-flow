// ── ADR-143 §4: editFormSpec — single source of truth for the chip Edit form ──
//
// One entry per entity type. The Phase E Edit-form renderer (not yet wired)
// reads editFormSpec[entityType] to decide which patch / append / annotate
// blocks to render. The arrays MUST stay in lockstep with the writer-side
// whitelists in carnatic/writer.py:
//
//   musician    ↔ PATCHABLE_MUSICIAN_FIELDS
//   raga        ↔ PATCHABLE_RAGA_FIELDS
//   composition ↔ PATCHABLE_COMPOSITION_FIELDS
//   recording   ↔ PATCHABLE_RECORDING_FIELDS                 (ADR-143 §6 — new)
//   edge        ↔ PATCHABLE_EDGE_FIELDS
//
// Drift between front-end and writer is the failure mode ADR-143 §4 forbids.
// When a new field becomes patchable in writer.py, append it here in the same
// commit. The render-gate is the only enforcement layer for now; an ADR-097
// future generated header would be preferable but is out of scope for Phase α.
//
// `appendable` enumerates the bounded-append targets ADR-143 §2 lists.
// `annotatable` is `true` when the entity's bucket admits an `annotate` op
// (ADR-097 §3 + ADR-143's matrix extension).

window.editFormSpec = {
  musician: {
    patchable:   ['label', 'born', 'died', 'era', 'instrument', 'bani', 'traditions'],
    appendable:  ['youtube', 'sources', 'youtube_performers', 'youtube_subjects'],
    annotatable: true,
  },
  raga: {
    patchable:   ['name', 'parent_raga', 'melakarta', 'is_melakarta', 'cakra', 'notes', 'katapayadi'],
    appendable:  ['aliases', 'sources'],
    annotatable: true,
  },
  composition: {
    patchable:   ['title', 'tala', 'language'],
    appendable:  ['sources'],
    annotatable: true,
  },
  recording: {
    // ADR-143 §6: new in this commit. Mirrors PATCHABLE_RECORDING_FIELDS.
    patchable:   ['title', 'short_title', 'date', 'venue', 'occasion', 'url'],
    // ADR-143 §2 bounded-append targets. `subjects.*` rejected by the writer
    // pending an architectural decision (see writer.append_to_recording_subject
    // and the .clinerules open question logged 2026-05-16); they are listed
    // here so the Edit-form renderer can show them as disabled-with-tooltip
    // rather than silently omit them.
    appendable:  ['segments', 'performers',
                  'subjects.raga_ids', 'subjects.composition_ids', 'subjects.musician_ids'],
    annotatable: true,
  },
  edge: {
    patchable:   ['confidence', 'source_url', 'note'],
    appendable:  [],
    annotatable: false,
  },
};

// Per-recording-segment patch surface (ADR-143 §3 row "Recording-segment").
// Selector is (recording_id, start-timestamp); see writer.patch_recording_segment.
// Listed separately because a segment is addressed within a recording, not as a
// top-level entity, so it does not get its own entry in editFormSpec.
window.editFormSpecSegment = {
  patchable:   ['composition_id', 'raga_id', 'tala', 'composer_id', 'display_title', 'notes'],
  appendable:  [],
  annotatable: false,
};
