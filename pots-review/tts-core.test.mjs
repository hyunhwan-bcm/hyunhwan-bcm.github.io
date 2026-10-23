import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSpeech, splitSpeech, MAX_CHARS } from './tts-core.mjs';

test('long clinical passages are split without dropping or duplicating words', () => {
  const cases = [
    'The patient reported dizziness. The symptom began three months earlier.',
    'Repeated observations ' + 'include symptoms, measurements, and functional findings; '.repeat(80),
    'x'.repeat(900),
    'POTS requires context. HPO and EHRs [12] record different information. An increase ≥40 is a measurement.',
    'The primary outcome is function; the secondary outcome is symptom burden.',
  ];
  for (const text of cases) {
    const chunks = splitSpeech(text);
    assert(chunks.every(chunk => chunk.length > 0 && chunk.length <= MAX_CHARS));
    assert.equal(chunks.join(' ').replace(/\s/g, ''), normalizeSpeech(text).replace(/\s/g, ''));
  }
});

test('empty text produces no synthesis requests', () => {
  assert.deepEqual(splitSpeech(''), []);
  assert.deepEqual(splitSpeech(' \n '), []);
});

test('narration omits citation markers while keeping clinical numbers', () => {
  const text = normalizeSpeech('POTS [1][2] ≥40 beats/min for 3 months, in 658 individuals.');
  assert(!text.includes('[1]'));
  assert(!text.includes('[2]'));
  assert(text.includes('40'));
  assert(text.includes('3 months'));
  assert(text.includes('658'));
  assert(text.includes('at least'));
});

test('URL removal and acronym expansion support spoken rather than visual text', () => {
  const text = normalizeSpeech('See https://example.org/article. EHRs, HPO, and LSTM.');
  assert(!text.includes('https:'));
  assert(text.includes('electronic health records'));
  assert(text.includes('H P O'));
  assert(text.includes('long short-term memory'));
});
