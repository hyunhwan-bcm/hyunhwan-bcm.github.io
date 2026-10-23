# Review read-aloud

The review at `index.html` has two explicitly labeled speech modes:

- **Kokoro** loads the pinned `kokoro-js` 1.2.1 and Transformers.js 3.5.1 browser modules from jsDelivr, then loads `onnx-community/Kokoro-82M-v1.0-ONNX` from Hugging Face. The quantized model is approximately 92 MB. Speech is generated on the reader's device in a module worker. Single-threaded WASM avoids dependence on cross-origin isolation headers, which this Pages site cannot configure.
- **Device voice** uses the browser's Speech Synthesis API as an optional alternative. It is never silently substituted for Kokoro.

Model/code downloads start only after Read is pressed. Paragraphs are split into short, bounded passages, and only the next passage is prefetched. The reader omits navigation, citation markers, and the reference list. Comparison cards are opt-in. Audio is released after playback or stopping. Pausing does not discard the current passage. Some mobile browsers require an additional Play tap after the first model download; the interface reports this explicitly.

The main review remains readable if JavaScript or the voice download is unavailable. Phone background execution and model memory limits depend on the browser; device voice is provided as an alternative.

## Files

- `tts-core.mjs`: text extraction, normalization, section selection, and chunking.
- `kokoro-worker.mjs`: lazy model loading and serialized synthesis.
- `tts-reader.mjs`: accessible controls, playback, highlighting, and cancellation.
- `tts-reader.css`: narrow-screen controls and the active playback dock.

## Checks

```sh
node --check pots-review/tts-reader.mjs
node --check pots-review/kokoro-worker.mjs
node --test pots-review/tts-core.test.mjs
```

Development requires HTTP or HTTPS rather than opening `index.html` as a `file:` URL because module workers follow browser origin rules. No build step or server-side TTS API is needed.

Upstream: https://github.com/hexgrad/kokoro/tree/main/kokoro.js (Apache-2.0).
