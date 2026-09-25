import assert from 'node:assert/strict';
import test from 'node:test';
import {
  comparisonUrl,
  parseSharedPath,
  scoringFromSearch,
  slug,
} from '../.tmp-test/comparisonUrl.js';

test('share URL preserves stable player IDs and scoring', () => {
  const left = { id: '123', name: 'A.J. Brown' };
  const right = { id: '456', name: 'Bijan Robinson' };
  const url = comparisonUrl(left, right, 'ppr');
  assert.equal(url, '/compare/123-vs-456/a-j-brown-vs-bijan-robinson?scoring=ppr');
  assert.deepEqual(parseSharedPath(url.split('?')[0]), { left: '123', right: '456' });
});

test('invalid share paths do not fabricate player IDs', () => {
  assert.equal(parseSharedPath('/'), null);
  assert.equal(parseSharedPath('/compare/one-player'), null);
});

test('scoring parser defaults invalid or missing values to half PPR', () => {
  assert.equal(scoringFromSearch('?scoring=standard'), 'standard');
  assert.equal(scoringFromSearch('?scoring=ppr'), 'ppr');
  assert.equal(scoringFromSearch('?scoring=unknown'), 'half_ppr');
  assert.equal(scoringFromSearch(''), 'half_ppr');
});

test('slug is stable and URL-safe', () => {
  assert.equal(slug("Ja'Marr Chase Jr."), 'ja-marr-chase-jr');
});
