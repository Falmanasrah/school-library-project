// Production storage: Cloud Firestore through the Firebase Admin SDK.
// Credentials come from the FIREBASE_SERVICE_ACCOUNT environment variable
// (the service-account JSON, either raw or base64 encoded).
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Every collection name gets a prefix (default "sls_") so this system's data never mixes with the
// old Teachers app, which wrote straight into a "bookings" collection of the same Firebase project.
const PREFIX = String(process.env.FIRESTORE_COLLECTION_PREFIX ?? 'sls_').replace(/[^A-Za-z0-9_-]/g, '');
export const collectionName = (col) => PREFIX + col;

function parseServiceAccount(raw) {
  let text = raw.trim();
  if (!text.startsWith('{')) text = Buffer.from(text, 'base64').toString('utf8');
  const sa = JSON.parse(text);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  if (!sa.project_id || !sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key.');
  return sa;
}

function normalizeError(e) {
  // gRPC / REST status codes: 5 NOT_FOUND, 6 ALREADY_EXISTS.
  if (e && (e.code === 6 || e.code === 'already-exists' || /ALREADY_EXISTS/.test(e.message || ''))) { e.code = 'ALREADY_EXISTS'; }
  else if (e && (e.code === 5 || e.code === 'not-found' || /NOT_FOUND/.test(e.message || ''))) { e.code = 'NOT_FOUND'; }
  return e;
}

export function createFirestoreDb(rawServiceAccount) {
  const sa = parseServiceAccount(rawServiceAccount);
  const app = getApps().length ? getApp() : initializeApp({ credential: cert(sa), projectId: sa.project_id });
  const fs = getFirestore(app);
  try { fs.settings({ ignoreUndefinedProperties: true, preferRest: true }); } catch { /* already initialised on a warm instance */ }

  const C = (col) => fs.collection(collectionName(col));
  const ref = (col, id) => C(col).doc(id);
  const toDoc = (snap) => (snap.exists ? { id: snap.id, ...snap.data() } : null);
  function buildQuery(col, { where = [], orderBy, limit } = {}) {
    let q = C(col);
    for (const [f, op, v] of where) q = q.where(f, op, v);
    if (orderBy) q = q.orderBy(orderBy[0], orderBy[1] || 'asc');
    if (limit) q = q.limit(limit);
    return q;
  }

  const db = {
    kind: 'firestore',
    projectId: sa.project_id,
    collectionPrefix: PREFIX,
    newId: () => C('ids').doc().id,
    async get(col, id) { return toDoc(await ref(col, id).get()); },
    async query(col, opts) { const snap = await buildQuery(col, opts).get(); return snap.docs.map(d => ({ id: d.id, ...d.data() })); },
    async create(col, id, data) {
      const r = id ? ref(col, id) : C(col).doc();
      try { await r.create(data); } catch (e) { throw normalizeError(e); }
      return r.id;
    },
    async set(col, id, data, { merge = false } = {}) { await ref(col, id).set(data, { merge }); },
    async update(col, id, data) { try { await ref(col, id).update(data); } catch (e) { throw normalizeError(e); } },
    async delete(col, id) { await ref(col, id).delete(); },
    async runTransaction(fn) {
      try {
        return await fs.runTransaction(async (t) => {
          const tx = {
            async get(col, id) { return toDoc(await t.get(ref(col, id))); },
            async query(col, opts) { const snap = await t.get(buildQuery(col, opts)); return snap.docs.map(d => ({ id: d.id, ...d.data() })); },
            create(col, id, data) { const r = id ? ref(col, id) : C(col).doc(); t.create(r, data); return r.id; },
            set(col, id, data, { merge = false } = {}) { t.set(ref(col, id), data, { merge }); },
            update(col, id, data) { t.update(ref(col, id), data); },
            delete(col, id) { t.delete(ref(col, id)); }
          };
          return fn(tx);
        });
      } catch (e) { throw normalizeError(e); }
    }
  };
  return db;
}
