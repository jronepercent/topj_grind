# clip-ai: transcribe -> captions -> description/tags

Run from the repo root. Scripts that touch Supabase/ElevenLabs need `node --env-file=.env.local`.
Outputs go to `.clip-ai/<content-id>/` (git-ignored); DB backups go to `backups/` (git-ignored).

1. `node --env-file=.env.local scripts/clip-ai/transcribe.mjs <id…|--missing|--all> [--force]`
   Extracts mono 16 kHz audio (ffmpeg), sends it to ElevenLabs Scribe (Thai, word timestamps), writes `scribe.json` + `transcript.txt`.
   Skips clips that already have `scribe.json`. Prints ElevenLabs characters before/after.
2. `node scripts/clip-ai/vtt.mjs <id…|--all>` builds YouTube-style Thai `captions.vtt` (2 lines x ~42 chars, 1-6 s cues). No network.
3. Claude reads `transcript.txt` and writes `meta.json`: `{ "description": "…", "tags": ["…"] }`
   (description <= 5000 chars, chapters as `0:00 หัวข้อ` lines, at least 3; tags <= 10, no leading #, each <= 40 chars).
4. `node --env-file=.env.local scripts/clip-ai/apply.mjs <id…|--all> [--dry-run]` validates, backs up the current
   description/tags/captions_vtt to `backups/clip-ai-<timestamp>.json`, then updates only the fields that have files.

Cost: step 1 spends ElevenLabs credits (Scribe bills by audio length; check the printed usage).
Re-running with an existing `scribe.json` is free, so tweak VTT/meta as often as you like. `--force` re-bills.
