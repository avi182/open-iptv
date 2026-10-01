import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualityLevel } from '../src/utils/quality.ts';

test('Auto delegates to bandwidth adaptation; manual selection chooses an available ceiling', () => {
  const levels = [240, 360, 480, 720, 1080].map(height => ({ height }));
  assert.equal(qualityLevel(levels, 'auto'), -1);
  assert.equal(qualityLevel(levels, '720'), 3);
  assert.equal(qualityLevel(levels.slice(0, 3), '1080'), 2);
  assert.equal(qualityLevel([{ height: 720 }, { height: 360 }], '240'), 1);
  assert.equal(qualityLevel([], '720'), -1);
});
