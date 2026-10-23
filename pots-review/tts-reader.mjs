import { readingSections, readingQueue } from './tts-core.mjs';

const main = document.querySelector('main');
const sections = readingSections(main);
const reader = document.createElement('details');
reader.className = 'tts-reader';
reader.id = 'listen';
reader.setAttribute('aria-label', 'Read aloud');
reader.innerHTML = `
  <summary>Listen</summary>
  <div class="tts-reader-body">
  <h2>Read aloud</h2>
  <p class="tts-note">Uses your phone or browser’s voice. Speed changes apply to the next passage.</p>
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
      <label>Speed<select id="tts-speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option></select></label>
    </div>
    <div class="tts-options">
      <label><input type="checkbox" id="tts-comparisons">Read comparison cards</label>
      <label><input type="checkbox" id="tts-follow">Follow along</label>
    </div>
  </details>
  </div>`;
main.querySelector('header').after(reader);
const listenLink = document.createElement('a');
listenLink.href = '#listen'; listenLink.textContent = 'Listen';
listenLink.setAttribute('aria-label', 'Open read-aloud controls');
listenLink.addEventListener('click', () => { reader.open = true; });
const openFromHash = () => { if (location.hash === '#listen') reader.open = true; };
window.addEventListener('hashchange', openFromHash);
openFromHash();
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
const fields = { scope: $('tts-scope'), voice: $('tts-voice'), speed: $('tts-speed') };
const gates = new Set();
let state = { active: false, paused: false, run: 0, queue: [], index: 0, phase: 'idle' };
let cancelPlayback;
let highlighted;
for (const section of sections) {
  fields.scope.add(new Option(section.title, section.id));

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

function passageStatus() {
  const segment = state.queue[state.index];
  if (segment) status(`${state.paused ? 'Paused · ' : ''}${segment.section.title} · Passage ${state.index + 1} of ${state.queue.length}`);
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
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  clearHighlight(); render('idle');
  if (announce) { $('tts-progress').value = 0; status('Stopped. Press Read to restart the selected text.'); }
}
function start(queue = null, index = 0) {
  stop(false);
  state.queue = queue || readingQueue(main, fields.scope.value, $('tts-comparisons').checked);
  if (!state.queue.length) { status('No readable text in this section.'); return; }
  state.index = index; state.active = true; state.paused = false;
  const run = state.run;
  try {
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Pediatric POTS research review', artist: 'Read aloud' });
  } catch {}
  const task = deviceLoop(run);
  task.then(() => finishReading(run)).catch(error => {
    if (!isCurrent(run)) return;
    console.error('Read-aloud error:', error);
    stop(false);
    status('Device speech is unavailable. Try another browser or an installed voice.');
    render('error');
  });
}
function toggle() {
  if (!state.active) return start();
  state.paused = !state.paused;
  if ('speechSynthesis' in window) {
    if (state.paused) speechSynthesis.pause();
    else speechSynthesis.resume();
  }
  if (!state.paused) releaseGates();
  render(state.paused ? 'paused' : 'playing'); passageStatus();
}
function jump(delta) {
  if (!state.active) return;
  const index = Math.max(0, Math.min(state.queue.length - 1, state.index + delta));
  start(state.queue, index);
}
function updateVoices() {
  const previous = fields.voice.value; fields.voice.replaceChildren();
  const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices().filter(v => /^en\b/i.test(v.lang)) : [];
  fields.voice.add(new Option('Default English voice', ''));
  for (const voice of voices) fields.voice.add(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI));
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
for (const field of [fields.scope, $('tts-comparisons')]) field.addEventListener('change', () => { stop(false); status('Ready. Press Read to start the selected text.'); });
if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => { if (!state.active) updateVoices(); });
if ('mediaSession' in navigator) {
  for (const [action, callback] of Object.entries({ play: () => { if (state.paused || !state.active) toggle(); }, pause: () => { if (state.active && !state.paused) toggle(); }, stop, nexttrack: () => jump(1), previoustrack: () => jump(-1) })) {
    try { navigator.mediaSession.setActionHandler(action, callback); } catch {}
  }
}
window.addEventListener('pagehide', () => stop(false));
updateVoices(); render();
