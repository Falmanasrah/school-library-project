// Checks the Firestore adapter against a fake Firestore (the real emulator needs Java, which is not available here):
// every collection it touches carries the prefix, so the old app's 'bookings' collection is never read or written.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
const seen = [];
const store = new Map();
function docRef(path, id) {
  const key = path + '/' + id;
  return {
    id, path: key,
    async get() { const v = store.get(key); return { id, exists: v !== undefined, data: () => v }; },
    async create(d) { if (store.has(key)) { const e = new Error('6 ALREADY_EXISTS'); e.code = 6; throw e; } store.set(key, d); },
    async set(d) { store.set(key, d); }, async update(d) { store.set(key, { ...store.get(key), ...d }); }, async delete() { store.delete(key); }
  };
}
let n = 0;
function coll(name) {
  seen.push(name);
  const filters = [];
  const q = {
    doc: (id) => docRef(name, id ?? 'auto' + (++n)),
    where(f, op, v) { filters.push([f, op, v]); return q; }, orderBy() { return q; }, limit() { return q; },
    async get() { const docs = [...store].filter(([k]) => k.startsWith(name + '/')).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })).filter(d => filters.every(([f, op, v]) => op === '==' ? d.data()[f] === v : true)); return { docs }; }
  };
  return q;
}
const fakeFs = { settings() {}, collection: coll, async runTransaction(fn) { return fn({ get: (r) => r.get(), create: (r, d) => { store.set(r.path, d); }, set: (r, d) => store.set(r.path, d), update() {}, delete() {} }); } };
mock.module('firebase-admin/app', { namedExports: { initializeApp: () => ({}), cert: (x) => x, getApps: () => [], getApp: () => ({}) } });
mock.module('firebase-admin/firestore', { namedExports: { getFirestore: () => fakeFs } });
const { createFirestoreDb } = await import('../api/_lib/db-firestore.js');

test('every collection the adapter touches is prefixed', async () => {
  const db = createFirestoreDb(JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'k' }));
  assert.equal(db.collectionPrefix, 'sls_');
  await db.create('bookings', 'b1', { date: '2026-11-22' });
  await db.set('meta', 'versions', { users: 1 });
  assert.deepEqual(await db.get('bookings', 'b1'), { id: 'b1', date: '2026-11-22' });
  assert.equal((await db.query('bookings', { where: [['date', '==', '2026-11-22']] })).length, 1);
  await assert.rejects(db.create('bookings', 'b1', {}), (e) => e.code === 'ALREADY_EXISTS');
  await db.runTransaction(async (tx) => { await tx.get('users', 'u1'); tx.create('auditLog', null, { a: 1 }); });
  db.newId();
  assert.ok(seen.length > 0 && seen.every(c => c.startsWith('sls_')), seen.join(','));
  assert.ok(![...store.keys()].some(k => k.startsWith('bookings/')), 'nothing written to the old collection');
});
