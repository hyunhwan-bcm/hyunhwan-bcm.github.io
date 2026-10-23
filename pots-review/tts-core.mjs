/** Text preparation shared by the read-aloud controller and its tests. */
export const MAX_CHARS = 240;

export function normalizeSpeech(text) {
  return text
    .replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/≥/g, ' at least ').replace(/≤/g, ' at most ')
    .replace(/±/g, ' plus or minus ')
    .replace(/\bEHRs\b/g, 'electronic health records')
    .replace(/\bEHR\b/g, 'electronic health record')
    .replace(/\bHPO\b/g, 'H P O')
    .replace(/\bGNNs?\b/g, 'graph neural networks')
    .replace(/\bLSTM\b/g, 'long short-term memory')
    .replace(/\bHR\/BP\b/g, 'heart rate and blood pressure')
    .replace(/\bAUROC\b/g, 'A U R O C').replace(/\bAUPRC\b/g, 'A U P R C')
    .replace(/\bPOTS\b/g, 'Pots')
    .replace(/\s+/g, ' ').trim();
}

/** Keep inputs well below Kokoro's token limit; never silently truncate prose. */
export function splitSpeech(text, limit = MAX_CHARS) {
  const cleaned = normalizeSpeech(text);
  if (!cleaned) return [];
  const sentences = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(cleaned)].map(s => s.segment.trim())
    : cleaned.split(/(?<=[.!?])\s+/);
  const result = [];
  for (const sentence of sentences) {
    let part = '';
    for (let word of sentence.split(/\s+/)) {
      while (word.length > limit) {
        if (part) { result.push(part); part = ''; }
        result.push(word.slice(0, limit)); word = word.slice(limit);
      }
      if (!word) continue;
      if (part && part.length + word.length + 1 > limit) {
        result.push(part); part = word;
      } else part = part ? `${part} ${word}` : word;
    }
    if (part) result.push(part);
  }
  return result;
}

export function readableText(element) {
  if (element.matches('.equation')) return element.getAttribute('aria-label') || 'Patient representation equation.';
  const copy = element.cloneNode(true);
  copy.querySelectorAll('.citations, .back, .badge, svg, script, style, button, .tts-reader, .contents').forEach(el => el.remove());
  copy.querySelectorAll('p, h3, li, dt, dd, summary, .result, .figure-note, .method-kind').forEach(el => {
    el.prepend(' '); el.append(' ');
  });
  return copy.textContent.replace(/\s+/g, ' ').trim();
}

export function readingSections(main) {
  return [...main.querySelectorAll(':scope > h2')]
    .filter(h => h.id !== 'references')
    .map(h => ({ id: h.id, title: readableText(h), heading: h }));
}

export function readingQueue(main, scope = 'all', includeComparisons = false) {
  const selected = readingSections(main).filter(section => scope === 'all'
    ? !['manuscript-and-figure-notes', 'search-and-verification-record'].includes(section.id)
    : section.id === scope);
  const queue = [];
  const add = (text, element, section) => splitSpeech(text).forEach(text => queue.push({ text, element, section }));
  for (const section of selected) {
    add(section.title, section.heading, section);
    for (let el = section.heading.nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
      if (el.matches('.tts-reader, .contents, footer')) continue;
      if (el.matches('.study-group')) {
        if (includeComparisons) for (const study of el.querySelectorAll('.study')) add(readableText(study), study, section);
      } else if (el.matches('.visuals')) {
        for (const part of el.children) add(readableText(part), part, section);
      } else add(readableText(el), el, section);
    }
  }
  return queue;
}
