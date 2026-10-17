# Open Questions — Archive (Resolved)

Resolved items formerly in `carnatic/OPERATIONS.md` → **Open questions**. Kept
for provenance; not read at session start. When an item in OPERATIONS.md is
resolved, move it here.

---

#### ADR-164 queue/playlist permalinks (raised 2026-10-17, resolved 2026-10-17)
- **RESOLVED** — implemented on branch `adr/164-shareable-queue-permalinks`.
  `encodePermalink` emits an optional `q` block on the v:2 state (no version
  bump — old readers ignore it and degrade to the single-item restore):
  `{pl, i}` share-by-reference for saved playlists (MediaQueue.playlistId,
  dropped on any queue edit), `{items, i}` inline for ephemeral queues
  (compact refs hard-capped at 20 with a surfaced truncation toast). Reader
  (permalink.js) rehydrates via `MediaQueue.start(items, i, {playlistId,
  seekSeconds})`; missing playlist ids degrade to the single current item.

#### Raga wheel — music coverage bug (resolved 2026-04-13)
- **RESOLVED** — `compsByRaga` in `raga_wheel.js` now indexes three sources: (1) compositions.json compositions[], (2) ragaToPerf structured recording performances, (3) elements[].data.tracks[] youtube entries. hamir_kalyani now shows 2 satellite nodes; 24 synthetic entries added across all ragas. See Carnatic Coder learning log 2026-04-13.

#### Recording subjects: top-level vs. lecdem-only (resolved 2026-05-16)
- **RESOLVED — subjects remain lecdem-only.** ADR-143 amended 2026-05-16: subjects live on `musicians/*.json.lecdems[*].subjects` and are appended through the owning musician chip's existing `youtube[vid].subjects.*` surface, not through the recording chip. The recording chip's Edit form drops `subjects.*` from `editFormSpec.recording.appendable`. `writer.append_to_recording_subject` is kept as a hard refusal so v2 bundles authored against the original draft fail with an actionable message rather than writing nowhere; the bani_add dispatcher routes `op=append, array='subjects.*'` on a recording to that refusal at ingest time. Rationale: migrating subjects to top-level recordings would duplicate state and weaken the musician–lecdem provenance link.

#### Data integrity — orphan composer_id (raised 2026-06-10, resolved 2026-06-12)
- **RESOLVED** — `shankari_shankuru.json` `composer_id` was the misspelled
`"syama_shastri"` (dropped 'h'); corrected to canonical `"shyama_shastri"`.
`cli.py validate` now reports "Graph is coherent" (0 errors) after `bani-render`.
Shyama Shastri now links 18 compositions. See Librarian learning log 2026-06-12.

### Lineage resolutions (historical)
- **Vina Dhanammal ↔ Trinity**: chain is `shyama_shastri → subbaraya_sastri → vina_dhanammal`
  (Dhanammal's mother trained under Subbaraya Sastri, son of Shyama Shastri). Confidence 0.90;
  note records the indirect nature.
- **T. Muktha dates**: corrected to born 1914, died 2007.
- **T. Muktha lineage note**: corrected to "via Kamakshi" (not Jayammal).
- **T. Viswanathan's guru**: formal guru was Tiruppamparam Swaminatha Pillai (~20 years).
  `vina_dhanammal → t_viswanathan` retained at 0.85 as inherited-bani edge; primary guru
  edge is `swaminatha_pillai → t_viswanathan` (0.97).
- **Dhanammal daughter branches**: Kamakshi (→ Brinda, Muktha) and Jayammal (→ Balasaraswati,
  Viswanathan) are now separate intermediate nodes.
- **T. Balasaraswati** added (1918–1984, Sangeetha Kalanidhi 1973, Padma Vibhushan 1977).
- **Kanchipuram Naina Pillai** added — taught both Brinda and Muktha.
- **ADR-021 Phase 3 melakarta migration** completed 2026-04-12: 13 mela ragas patched with is_melakarta=true and cakra; 53 janya ragas set to is_melakarta=false. ADR-022 UI now fully functional for mela/janya navigation.
