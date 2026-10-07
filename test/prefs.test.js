const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePrefs, DEFAULT_PREFS } = require('../src/core/prefs');

test('기본값과 범위 보정', () => {
  assert.deepEqual(normalizePrefs(), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs({ scale: 5, opacity: 0, mouseReact: false, hidden: 1 }),
    { scale: 1.5, opacity: 0.3, mouseReact: false, hidden: true, autoStart: true });
  assert.equal(normalizePrefs({ autoStart: false }).autoStart, false);
  assert.equal(normalizePrefs({ scale: 'abc' }).scale, 1);
  assert.equal(normalizePrefs({ opacity: 0.555 }).opacity, 0.56);
});
