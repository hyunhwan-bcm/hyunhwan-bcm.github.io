# Read aloud

The collapsed Listen panel uses the browser Speech Synthesis API and available English device voices. There are no model downloads or external JavaScript speech dependencies. Voice availability and behavior depend on the browser and operating system.

Controls include section selection, voice, speed, pause/resume, previous/next passage, stop, and optional follow-along highlighting. Speed changes apply to the next passage.

Run checks with `node --test pots-review/tts-core.test.mjs` and `node --check pots-review/tts-reader.mjs`.
