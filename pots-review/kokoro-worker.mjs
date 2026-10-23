// Pinned upstream package versions; inference stays in this worker.
const KOKORO_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm';
let model;
let initialization;
let chain = Promise.resolve();

function initialize() {
  if (initialization) return initialization;
  initialization = (async () => {
    self.postMessage({ type: 'progress', label: 'Loading Kokoro…' });
    const [{ KokoroTTS }, { env }] = await Promise.all([import(KOKORO_URL), import(TRANSFORMERS_URL)]);
    env.allowLocalModels = false;
    // GitHub Pages cannot set the isolation headers required by multi-threaded WASM.
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
    model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8', device: 'wasm',
      progress_callback(event) {
        if (event.status === 'progress' && /\.onnx$/.test(event.file || '')) {
          self.postMessage({ type: 'progress', label: `Downloading voice model: ${Math.round(event.progress || 0)}%`, percent: event.progress });
        } else if (event.status === 'done' && /\.onnx$/.test(event.file || '')) {
          self.postMessage({ type: 'progress', label: 'Preparing Kokoro on this device…' });
        }
      },
    });
    self.postMessage({ type: 'ready', voices: model.voices });
  })();
  return initialization;
}

self.onmessage = ({ data }) => {
  if (data.type === 'initialize') {
    initialize().catch(error => self.postMessage({ type: 'error', id: 'init', message: String(error.message || error) }));
  } else if (data.type === 'generate') {
    chain = chain.catch(() => {}).then(async () => {
      try {
        await initialize();
        const audio = await model.generate(data.text, { voice: data.voice, speed: 1 });
        self.postMessage({ type: 'audio', id: data.id, blob: audio.toBlob(), samples: audio.audio.length, sampleRate: audio.sampling_rate });
      } catch (error) {
        self.postMessage({ type: 'error', id: data.id, message: String(error.message || error) });
      }
    });
  }
};
