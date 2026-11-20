// The version number must be the same everywhere, or installed apps would not update together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVersions, nextVersion } from '../scripts/release.mjs';

test('every file carries the same version number', () => {
  const found = readVersions();
  assert.equal(found.length, 7);
  assert.equal(new Set(found.map(f => f.version)).size, 1, JSON.stringify(found));
});

test('release types bump the right part of the version', () => {
  assert.equal(nextVersion('2.0.9'), '2.0.10');
  assert.equal(nextVersion('2.3.4', 'minor'), '2.4.0');
  assert.equal(nextVersion('2.3.4', 'major'), '3.0.0');
  assert.equal(nextVersion('2.3.4', '2.5.0'), '2.5.0');
  assert.throws(() => nextVersion('2.3.4', 'banana'), /Unknown release type/);
});
