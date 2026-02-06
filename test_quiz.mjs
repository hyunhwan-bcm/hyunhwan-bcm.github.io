#!/usr/bin/env node
/**
 * Test the quiz logic, HTML structure, images, and cheatsheet.
 * - Validates both HTML pages contain required elements
 * - Tests the JS quiz mapping against all 1024 combos
 * - Verifies even distribution (64 per type)
 * - Checks all 16 type images exist
 * - Validates cheatsheet page structure
 */
import { readFileSync, existsSync } from 'fs';
import { strict as assert } from 'assert';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} - ${e.message}`);
    failed++;
  }
}

// ── Index page tests ──
const html = readFileSync('choose-your-fighter/index.html', 'utf-8');

console.log('Index Page - HTML Structure:');
test('has DOCTYPE', () => assert.ok(html.includes('<!DOCTYPE html>')));
test('has <html> tag', () => assert.ok(html.match(/<html[\s>]/)));
test('has closing </html>', () => assert.ok(html.includes('</html>')));
test('has <head>', () => assert.ok(html.includes('<head>')));
test('has <body>', () => assert.ok(html.includes('<body>')));
test('has <title>', () => assert.ok(html.includes('<title>')));
test('has viewport meta', () => assert.ok(html.includes('viewport')));
test('has start-screen div', () => assert.ok(html.includes('id="start-screen"')));
test('has quiz-screen div', () => assert.ok(html.includes('id="quiz-screen"')));
test('has result-screen div', () => assert.ok(html.includes('id="result-screen"')));

console.log('\nIndex Page - Features:');
test('has YouTube music player', () => assert.ok(html.includes('youtube.com/iframe_api')));
test('has music toggle button', () => assert.ok(html.includes('toggleMusic')));
test('references video ID IstvN-NN_9k', () => assert.ok(html.includes('IstvN-NN_9k')));
test('links to cheatsheet', () => assert.ok(html.includes('cheatsheet.html')));
test('uses type images', () => assert.ok(html.includes('images/type-')));

console.log('\nIndex Page - Quiz Data:');
const typesMatch = html.match(/const TYPES = \[([\s\S]*?)\n\];/);
test('TYPES array exists', () => assert.ok(typesMatch));
const typeEntries = typesMatch[1].match(/\{[\s\S]*?\}/g);
test('has exactly 16 types', () => assert.equal(typeEntries.length, 16));

const questionsMatch = html.match(/const QUESTIONS = \[([\s\S]*?)\];/);
test('QUESTIONS array exists', () => assert.ok(questionsMatch));
const questions = questionsMatch[1].match(/"[^"]+"/g);
test('has exactly 10 questions', () => assert.equal(questions.length, 10));

// ── Quiz logic tests ──
console.log('\nQuiz Logic:');
function getTypeIndex(ans) {
  const bit0 = ans[0] ^ ans[4] ^ ans[8];
  const bit1 = ans[1] ^ ans[5] ^ ans[9];
  const bit2 = ans[2] ^ ans[6];
  const bit3 = ans[3] ^ ans[7];
  return (bit3 << 3) | (bit2 << 2) | (bit1 << 1) | bit0;
}

test('getTypeIndex XOR formula present in HTML', () => {
  assert.ok(html.includes('ans[0] ^ ans[4] ^ ans[8]'));
  assert.ok(html.includes('ans[1] ^ ans[5] ^ ans[9]'));
  assert.ok(html.includes('ans[2] ^ ans[6]'));
  assert.ok(html.includes('ans[3] ^ ans[7]'));
});

const counts = new Array(16).fill(0);
for (let i = 0; i < 1024; i++) {
  const answers = [];
  for (let bit = 0; bit < 10; bit++) answers.push((i >> bit) & 1);
  const idx = getTypeIndex(answers);
  assert.ok(idx >= 0 && idx < 16, `Index ${idx} out of range`);
  counts[idx]++;
}

test('all type indices are 0-15', () => {
  for (let i = 0; i < 16; i++) assert.ok(counts[i] > 0);
});

test('each type gets exactly 64 combinations', () => {
  for (let i = 0; i < 16; i++) assert.equal(counts[i], 64);
});

test('all-YES gives type 3', () => assert.equal(getTypeIndex([1,1,1,1,1,1,1,1,1,1]), 3));
test('all-NO gives type 0', () => assert.equal(getTypeIndex([0,0,0,0,0,0,0,0,0,0]), 0));

// ── Image tests ──
console.log('\nImage Files:');
for (let i = 0; i < 16; i++) {
  const path = `choose-your-fighter/images/type-${i.toString().padStart(2, '0')}.png`;
  test(`type-${i.toString().padStart(2, '0')}.png exists`, () => assert.ok(existsSync(path)));
}

// ── Cheatsheet page tests ──
console.log('\nCheatsheet Page:');
const cheatsheet = readFileSync('choose-your-fighter/cheatsheet.html', 'utf-8');
test('cheatsheet has DOCTYPE', () => assert.ok(cheatsheet.includes('<!DOCTYPE html>')));
test('cheatsheet has <title>', () => assert.ok(cheatsheet.includes('<title>')));
test('cheatsheet has viewport meta', () => assert.ok(cheatsheet.includes('viewport')));
test('cheatsheet has getTypeIndex function', () => assert.ok(cheatsheet.includes('getTypeIndex')));
test('cheatsheet has chart container', () => assert.ok(cheatsheet.includes('chart-container')));
test('cheatsheet has heatmap', () => assert.ok(cheatsheet.includes('id="heatmap"')));
test('cheatsheet has type gallery', () => assert.ok(cheatsheet.includes('type-gallery')));
test('cheatsheet links back to quiz', () => assert.ok(cheatsheet.includes('index.html')));
test('cheatsheet references type images', () => assert.ok(cheatsheet.includes('images/type-')));
test('cheatsheet has 16 TYPES entries', () => {
  const m = cheatsheet.match(/const TYPES = \[([\s\S]*?)\];/);
  assert.ok(m);
  assert.equal(m[1].match(/\{[\s\S]*?\}/g).length, 16);
});

// ── Distribution ──
console.log('\nDistribution:');
for (let i = 0; i < 16; i++) {
  console.log(`  Type ${i.toString().padStart(2)}: ${counts[i]} combinations`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
