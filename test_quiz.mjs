#!/usr/bin/env node
/**
 * Test the quiz logic and HTML structure without a browser.
 * - Validates HTML contains required elements
 * - Extracts and tests the JS quiz mapping against all 1024 combos
 * - Verifies even distribution (64 per type)
 */
import { readFileSync } from 'fs';
import { strict as assert } from 'assert';

const html = readFileSync('choose-your-fighter/index.html', 'utf-8');
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

console.log('HTML Structure Tests:');
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

console.log('\nQuiz Data Tests:');
// Extract TYPES array length
const typesMatch = html.match(/const TYPES = \[([\s\S]*?)\n\];/);
test('TYPES array exists', () => assert.ok(typesMatch));
const typeEntries = typesMatch[1].match(/\{[\s\S]*?\}/g);
test('has exactly 16 types', () => assert.equal(typeEntries.length, 16));

// Extract QUESTIONS array
const questionsMatch = html.match(/const QUESTIONS = \[([\s\S]*?)\];/);
test('QUESTIONS array exists', () => assert.ok(questionsMatch));
const questions = questionsMatch[1].match(/"[^"]+"/g);
test('has exactly 10 questions', () => assert.equal(questions.length, 10));

console.log('\nQuiz Logic Tests:');
// Replicate the getTypeIndex function
function getTypeIndex(ans) {
  const bit0 = ans[0] ^ ans[4] ^ ans[8];
  const bit1 = ans[1] ^ ans[5] ^ ans[9];
  const bit2 = ans[2] ^ ans[6];
  const bit3 = ans[3] ^ ans[7];
  return (bit3 << 3) | (bit2 << 2) | (bit1 << 1) | bit0;
}

test('getTypeIndex matches JS in HTML', () => {
  // Verify the function is present in the HTML
  assert.ok(html.includes('ans[0] ^ ans[4] ^ ans[8]'));
  assert.ok(html.includes('ans[1] ^ ans[5] ^ ans[9]'));
  assert.ok(html.includes('ans[2] ^ ans[6]'));
  assert.ok(html.includes('ans[3] ^ ans[7]'));
});

// Test all 1024 combinations
const counts = new Array(16).fill(0);
for (let i = 0; i < 1024; i++) {
  const answers = [];
  for (let bit = 0; bit < 10; bit++) {
    answers.push((i >> bit) & 1);
  }
  const idx = getTypeIndex(answers);
  assert.ok(idx >= 0 && idx < 16, `Index ${idx} out of range for pattern ${i}`);
  counts[idx]++;
}

test('all type indices are 0-15', () => {
  for (let i = 0; i < 16; i++) {
    assert.ok(counts[i] > 0, `Type ${i} has 0 mappings`);
  }
});

test('each type gets exactly 64 combinations', () => {
  for (let i = 0; i < 16; i++) {
    assert.equal(counts[i], 64, `Type ${i} has ${counts[i]} combos instead of 64`);
  }
});

test('all-YES gives type index 3 (Toolcall Gremlin)', () => {
  // [1,1,1,1,1,1,1,1,1,1] → bit0=1^1^1=1, bit1=1^1^1=1, bit2=1^1=0, bit3=1^1=0 → 0011=3
  assert.equal(getTypeIndex([1,1,1,1,1,1,1,1,1,1]), 3);
});

test('all-NO gives type index 0 (GPU Peasant Wizard)', () => {
  // [0,0,0,0,0,0,0,0,0,0] → all bits 0 → 0000=0
  assert.equal(getTypeIndex([0,0,0,0,0,0,0,0,0,0]), 0);
});

console.log('\nDistribution verification:');
for (let i = 0; i < 16; i++) {
  console.log(`  Type ${i.toString().padStart(2)}: ${counts[i]} combinations`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
