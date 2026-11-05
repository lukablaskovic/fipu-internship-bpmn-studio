import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStudioEditor } from '../studio-access.mjs';

test('only verified university accounts for all four administrators can edit', () => {
  for (const email of ['ntankov@unipu.hr', 'ilorencin@unipu.hr', 'lblaskovi@unipu.hr', 'mmilicevi@unipu.hr']) {
    const claims = { email, email_verified: true, hd: 'unipu.hr' };
    assert.equal(isStudioEditor(claims), true);
    assert.equal(isStudioEditor({ ...claims, email_verified: false }), false);
    assert.equal(isStudioEditor({ ...claims, email_verified: 'true' }), false);
    assert.equal(isStudioEditor({ ...claims, hd: 'other.hr' }), false);
  }
  assert.equal(isStudioEditor({ email: 'other@unipu.hr', email_verified: true, hd: 'unipu.hr' }), false);
  assert.equal(isStudioEditor({}), false);
});
