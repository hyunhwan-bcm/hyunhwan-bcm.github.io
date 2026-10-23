import { readingSections, readingQueue } from './tts-core.mjs';

const main = document.querySelector('main');
const sections = readingSections(main);
const reader = document.createElement('aside');
reader.className = 'tts-reader';
reader.id = 'listen';
reader.setAttribute('aria-label', 'Read aloud');
reader.innerHTML = `
  <h2>Listen with Kokoro</h2>
  <p class="tts-note" id="tts-note">First use downloads a voice model (about 90 MB). Speech is generated on this device. The initial start can take a moment.</p>
  <div class="tts-fields">
    <label>Read<select id="tts-scope"><option value="all">Whole review</option></select></label>
  </div>
  <div class="tts-actions">
    <button type="button" data-tts="previous" aria-label="Previous passage" disabled>‹</button>
    <button type="button" data-tts="play" class="tts-primary">Read</button>
    <button type="button" data-tts="stop" disabled>Stop</button>
    <button type="button" data-tts="next" aria-label="Next passage" disabled>›</button>
  </div>
  <p id="tts-status" class="tts-status" role="status" aria-live="polite">Choose a section, then press Read.</p>
  <progress id="tts-progress" class="tts-progress" max="1" value="0" aria-label="Reading progress"></progress>
  <details class="tts-settings">
    <summary>Voice and reading options</summary>
    <div class="tts-fields">
      <label>Voice<select id="tts-voice"></select></label>
      <label>Voice engine<select id="tts-engine"><option value="kokoro">Kokoro</option><option value="device">Device voice</option></select></label>
      <label>Speed<select id="tts-speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option></select></label>
    </div>
    <div class="tts-options">
      <label><input type="checkbox" id="tts-comparisons">Read comparison cards</label>
      <label><input type="checkbox" id="tts-follow">Follow along</label>
    </div>
  </details>
  <button type="button" id="tts-fallback" class="tts-fallback" hidden>Use device voice instead</button>
  <p class="tts-attribution"><a href="https://github.com/hexgrad/kokoro/tree/main/kokoro.js">Kokoro</a> · No text is sent to a TTS server in Kokoro mode.</p>
  <audio id="tts-audio" preload="auto" hidden></audio>`;
main.querySelector('header').after(reader);
const listenLink = document.createElement('a');
listenLink.href = '#listen'; listenLink.textContent = 'Listen';
listenLink.setAttribute('aria-label', 'Open read-aloud controls');
const readerbar = document.querySelector('.readerbar');
readerbar.querySelector('a').textContent = 'POTS review';
readerbar.querySelector('.size-controls').before(listenLink);
const dock = document.createElement('div');
dock.id = 'tts-dock'; dock.hidden = true; dock.setAttribute('aria-label', 'Audio playback controls');
dock.innerHTML = `<span id="tts-dock-label"></span><div class="tts-actions">
  <button type="button" data-tts="previous" aria-label="Previous passage">‹</button>
  <button type="button" data-tts="play" class="tts-primary">Pause</button>
  <button type="button" data-tts="stop">Stop</button>
  <button type="button" data-tts="next" aria-label="Next passage">›</button></div>`;
document.body.append(dock);

const $ = id => document.getElementById(id);
const fields = { scope: $('tts-scope'), engine: $('tts-engine'), voice: $('tts-voice'), speed: $('tts-speed') };
const audio = $('tts-audio');
let worker, initializePromise, initializeResolve, initializeReject, loadTimer;
let modelReady = false, requestId = 0;
const pending = new Map();
const gates = new Set();
let state = { active: false, paused: false, run: 0, queue: [], index: 0, phase: 'idle' };
let cancelPlayback;
let highlighted;
const kokoroVoices = [
  ['af_heart', 'Heart · American English'],
  ['af_bella', 'Bella · American English'],
  ['am_michael', 'Michael · American English'],
  ['bf_emma', 'Emma · British English'],
];

for (const section of sections) {
  fields.scope.add(new Option(section.title, section.id));
  const listen = document.createElement('button');
  listen.type = 'button'; listen.className = 'tts-section-button'; listen.textContent = 'Listen';
  listen.setAttribute('aria-label', `Listen to ${section.title}`);
  listen.addEventListener('click', () => { stop(false); fields.scope.value = section.id; start(); });
  section.heading.append(listen);
}

function status(message) { $('tts-status').textContent = message; $('tts-dock-label').textContent = message; }
function render(phase = state.phase) {
  state.phase = phase; reader.dataset.phase = phase;
  const loading = state.active && ['loading', 'generating'].includes(phase) && !state.paused;
  const label = state.active ? (state.paused ? 'Play' : loading ? 'Preparing…' : 'Pause') : 'Read';
  document.querySelectorAll('[data-tts="play"]').forEach(b => {
    b.textContent = label;
    b.disabled = state.active && phase === 'loading' && !state.paused;
    b.setAttribute('aria-label', state.active ? (state.paused ? 'Resume reading' : 'Pause reading') : 'Read selected text');
  });
  document.querySelectorAll('[data-tts="stop"]').forEach(b => b.disabled = !state.active);
  document.querySelectorAll('[data-tts="previous"]').forEach(b => b.disabled = !state.active || phase === 'loading' || state.index === 0);
  document.querySelectorAll('[data-tts="next"]').forEach(b => b.disabled = !state.active || phase === 'loading' || state.index + 1 >= state.queue.length);
  fields.voice.disabled = state.active;
  dock.hidden = !state.active;
  document.body.classList.toggle('tts-active', state.active);
  $('tts-progress').max = Math.max(1, state.queue.length);
  $('tts-progress').value = state.active ? state.index : Math.min($('tts-progress').value, $('tts-progress').max);
  try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state.active ? (state.paused ? 'paused' : 'playing') : 'none'; } catch {}
}
function clearHighlight() { highlighted?.classList.remove('tts-current'); highlighted = null; }
function mark(segment) {
  clearHighlight(); highlighted = segment.element; highlighted.classList.add('tts-current');
  if (highlighted.matches('details')) highlighted.open = true;
  if ($('tts-follow').checked) highlighted.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
function isCurrent(run) { return state.active && state.run === run; }
function releaseGates() { gates.forEach(resolve => resolve()); gates.clear(); }
async function waitForResume(run) {
  while (isCurrent(run) && state.paused) await new Promise(resolve => gates.add(resolve));
  return isCurrent(run);
}

function discardWorker() {
  clearTimeout(loadTimer);
  if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); worker = null; }
  modelReady = false;
  initializeReject?.(new Error('Canceled'));
  initializeResolve = initializeReject = null; initializePromise = null;
  for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('Canceled')); }
  pending.clear();
}
function ensureKokoro() {
  if (modelReady) return Promise.resolve();
  if (initializePromise) return initializePromise;
  if (!('Worker' in window)) return Promise.reject(new Error('Web workers are unavailable'));
  initializePromise = new Promise((resolve, reject) => { initializeResolve = resolve; initializeReject = reject; });
  worker = new Worker(new URL('./kokoro-worker.mjs?v=1', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      if (state.active && state.phase === 'loading') status(data.label);
    } else if (data.type === 'ready') {
      clearTimeout(loadTimer); modelReady = true;
      initializeResolve?.(); initializeResolve = initializeReject = null;
    } else if (data.type === 'audio' || data.type === 'error') {
      if (data.id === 'init') { clearTimeout(loadTimer); initializeReject?.(new Error(data.message)); return; }
      const task = pending.get(data.id);
      if (!task) return;
      pending.delete(data.id); clearTimeout(task.timer);
      if (data.type === 'audio') {
        reader.dataset.lastAudioBytes = String(data.blob.size);
        task.resolve(data.blob);
      } else task.reject(new Error(data.message));
    }
  };
  worker.onerror = error => {
    initializeReject?.(new Error(error.message || 'Kokoro worker failed'));
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('Kokoro worker failed')); }
    pending.clear();
    if (modelReady) { modelReady = false; initializePromise = null; }
  };
  loadTimer = setTimeout(() => initializeReject?.(new Error('Model download timed out')), 300_000);
  worker.postMessage({ type: 'initialize' });
  return initializePromise;
}
function generate(text, voice) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Speech generation timed out')); }, 180_000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ type: 'generate', id, text, voice });
  });
}

function playBlob(blob, run) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = result => {
      if (done) return; done = true;
      audio.removeEventListener('ended', onEnd); audio.removeEventListener('error', onError);
      if (cancelPlayback === cancel) cancelPlayback = null;
      audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url);
      resolve(result);
    };
    const onEnd = () => finish(null);
    const onError = () => finish(new Error('Audio playback failed'));
    const cancel = () => finish(null);
    cancelPlayback = cancel;
    audio.addEventListener('ended', onEnd); audio.addEventListener('error', onError);
    audio.src = url; audio.playbackRate = Number(fields.speed.value); audio.preservesPitch = true;
    audio.play().then(() => {
      if (!isCurrent(run)) return cancel();
      render('playing'); passageStatus();
    }).catch(error => {
      if (!isCurrent(run)) return cancel();
      if (error.name === 'NotAllowedError') {
        state.paused = true; render('paused'); status('Voice ready. Tap Play to start audio.');
      } else finish(error);
    });
  });
}
function passageStatus() {
  const segment = state.queue[state.index];
  if (segment) status(`${state.paused ? 'Paused · ' : ''}${segment.section.title} · Passage ${state.index + 1} of ${state.queue.length}`);
}
async function kokoroLoop(run, voice) {
  render('loading'); status(modelReady ? 'Preparing the first passage…' : 'Loading Kokoro. First download: about 90 MB…');
  await ensureKokoro();
  if (!isCurrent(run)) return;
  // Capture prefetch failures as values so stopping never leaves an unhandled rejection.
  const request = index => generate(state.queue[index].text, voice).then(blob => ({ blob }), error => ({ error }));
  let next = request(state.index);
  for (; isCurrent(run) && state.index < state.queue.length; state.index++) {
    render(state.paused ? 'paused' : 'generating');
    if (!state.paused) status(`Preparing passage ${state.index + 1} of ${state.queue.length}…`);
    const result = await next;
    if (!isCurrent(run)) return;
    if (result.error) throw result.error;
    next = state.index + 1 < state.queue.length ? request(state.index + 1) : null;
    if (!await waitForResume(run)) return;
    mark(state.queue[state.index]);
    const error = await playBlob(result.blob, run);
    if (error) throw error;
  }
}
function speak(segment, run) {
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(segment.text);
    const chosen = speechSynthesis.getVoices().find(v => v.voiceURI === fields.voice.value);
    if (chosen) utterance.voice = chosen;
    utterance.lang = chosen?.lang || 'en-US'; utterance.rate = Number(fields.speed.value);
    let settled = false;
    const finish = error => { if (settled) return; settled = true; if (cancelPlayback === cancel) cancelPlayback = null; resolve(error); };
    const cancel = () => { speechSynthesis.cancel(); finish(null); };
    cancelPlayback = cancel;
    utterance.onend = () => finish(null);
    utterance.onerror = event => finish(isCurrent(run) && !['interrupted', 'canceled'].includes(event.error) ? new Error('Device speech failed') : null);
    speechSynthesis.speak(utterance);
  });
}
async function deviceLoop(run) {
  if (!('speechSynthesis' in window)) throw new Error('Device voices are unavailable');
  for (; isCurrent(run) && state.index < state.queue.length; state.index++) {
    if (!await waitForResume(run)) return;
    mark(state.queue[state.index]); render('playing'); passageStatus();
    const error = await speak(state.queue[state.index], run);
    if (error) throw error;
  }
}
function finishReading(run) {
  if (!isCurrent(run)) return;
  state.active = false; state.paused = false; clearHighlight(); render('finished');
  $('tts-progress').value = state.queue.length;
  status('Finished reading. Choose another section or press Read again.');
}
function stop(announce = true) {
  state.run++; state.active = false; state.paused = false;
  releaseGates(); cancelPlayback?.();
  audio.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (worker && !modelReady) discardWorker();
  clearHighlight(); render('idle');
  if (announce) { $('tts-progress').value = 0; status('Stopped. Press Read to restart the selected text.'); }
}
function start(queue = null, index = 0) {
  stop(false); $('tts-fallback').hidden = true;
  state.queue = queue || readingQueue(main, fields.scope.value, $('tts-comparisons').checked);
  if (!state.queue.length) { status('No readable text in this section.'); return; }
  state.index = index; state.active = true; state.paused = false;
  const run = state.run;
  try {
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Pediatric POTS research review', artist: 'Read aloud' });
  } catch {}
  const task = fields.engine.value === 'kokoro' ? kokoroLoop(run, fields.voice.value) : deviceLoop(run);
  task.then(() => finishReading(run)).catch(error => {
    if (!isCurrent(run)) return;
    console.error('Read-aloud error:', error);
    const engine = fields.engine.value;
    stop(false);
    if (engine === 'kokoro') {
      discardWorker();
      status('Kokoro could not prepare audio. Check your connection and retry, or use a device voice.');
      $('tts-fallback').hidden = !('speechSynthesis' in window);
    } else status('Device speech is unavailable in this browser. Try Kokoro or another browser.');
    render('error');
  });
}
function toggle() {
  if (!state.active) return start();
  if (!state.paused) {
    state.paused = true; audio.pause();
    if (fields.engine.value === 'device' && 'speechSynthesis' in window) speechSynthesis.pause();
    render('paused'); passageStatus();
  } else {
    state.paused = false;
    // Keep play() in the tap handler for browsers that require user activation.
    if (fields.engine.value === 'kokoro' && audio.hasAttribute('src')) {
      audio.play().then(() => { if (state.active) { render('playing'); passageStatus(); } }).catch(() => {
        if (state.active) { state.paused = true; render('paused'); status('Tap Play again to allow audio in this browser.'); }
      });
    } else if (fields.engine.value === 'device') speechSynthesis.resume();
    releaseGates(); render('playing'); passageStatus();
  }
}
function jump(delta) {
  if (!state.active) return;
  const index = Math.max(0, Math.min(state.queue.length - 1, state.index + delta));
  start(state.queue, index);
}
function updateVoices() {
  const previous = fields.voice.value; fields.voice.replaceChildren();
  reader.querySelector('h2').textContent = fields.engine.value === 'kokoro' ? 'Listen with Kokoro' : 'Listen with device voice';
  if (fields.engine.value === 'kokoro') {
    for (const [id, name] of kokoroVoices) fields.voice.add(new Option(name, id));
    $('tts-note').textContent = 'First use downloads a voice model (about 90 MB). Speech is generated on this device. The initial start can take a moment.';
  } else {
    $('tts-note').textContent = 'Uses your phone or browser’s installed voice. Speed changes apply to the next passage.';
    const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices().filter(v => /^en\b/i.test(v.lang)) : [];
    fields.voice.add(new Option('Default English voice', ''));
    for (const voice of voices) fields.voice.add(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI));
  }
  if ([...fields.voice.options].some(o => o.value === previous)) fields.voice.value = previous;
}
for (const button of document.querySelectorAll('[data-tts]')) {
  button.addEventListener('click', () => {
    const action = button.dataset.tts;
    if (action === 'play') toggle();
    else if (action === 'stop') stop();
    else jump(action === 'previous' ? -1 : 1);
  });
}
for (const field of [fields.scope, fields.engine, $('tts-comparisons')]) field.addEventListener('change', () => { stop(false); updateVoices(); status('Ready. Press Read to start the selected text.'); $('tts-fallback').hidden = true; });
fields.speed.addEventListener('change', () => { audio.playbackRate = Number(fields.speed.value); });
$('tts-fallback').addEventListener('click', () => { fields.engine.value = 'device'; updateVoices(); start(); });
if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => { if (fields.engine.value === 'device') updateVoices(); });
if ('mediaSession' in navigator) {
  for (const [action, callback] of Object.entries({ play: () => { if (state.paused || !state.active) toggle(); }, pause: () => { if (state.active && !state.paused) toggle(); }, stop, nexttrack: () => jump(1), previoustrack: () => jump(-1) })) {
    try { navigator.mediaSession.setActionHandler(action, callback); } catch {}
  }
}
window.addEventListener('pagehide', () => { stop(false); discardWorker(); });
updateVoices(); render();
