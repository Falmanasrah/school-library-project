// In-memory document store with the same interface and query limits as the
// Firestore adapter. Used for local development and automated tests, and it
// can persist to a JSON file. Queries that would need a Firestore composite
// index throw, so code that passes the tests also works on Firestore.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RANGE_OPS = new Set(['<', '<=', '>', '>=', '!=', 'not-in']);

function clone(v) { return v === undefined ? undefined : structuredClone(v); }
function stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = stripUndefined(v);
    return out;
  }
  return obj;
}
function isPlain(o) { return o && typeof o === 'object' && !Array.isArray(o); }
function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}

function cmp(a, b) {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

function matches(doc, [field, op, value]) {
  const v = doc[field];
  switch (op) {
    case '==': return v === value;
    case '!=': return v !== value && v !== undefined;
    case '<': return v !== undefined && v !== null && v < value;
    case '<=': return v !== undefined && v !== null && v <= value;
    case '>': return v !== undefined && v !== null && v > value;
    case '>=': return v !== undefined && v !== null && v >= value;
    case 'in': return value.includes(v);
    case 'not-in': return v !== undefined && !value.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(value);
    default: throw new Error(`Unsupported operator ${op}`);
  }
}

export function checkIndexFree(col, { where = [], orderBy } = {}) {
  const ranges = new Set(where.filter(w => RANGE_OPS.has(w[1])).map(w => w[0]));
  const eqs = where.filter(w => !RANGE_OPS.has(w[1]));
  if (ranges.size > 1) throw new Error(`Query on ${col} needs a composite index (range filters on several fields).`);
  const rangeField = [...ranges][0];
  if (rangeField && orderBy && orderBy[0] !== rangeField) throw new Error(`Query on ${col} needs a composite index (orderBy differs from range field).`);
  if (eqs.length && (rangeField || orderBy)) throw new Error(`Query on ${col} needs a composite index (equality + range/orderBy).`);
}

function runQuery(store, col, opts = {}) {
  checkIndexFree(col, opts);
  const { where = [], orderBy, limit } = opts;
  const coll = store.get(col);
  if (!coll) return [];
  let docs = [...coll.entries()].map(([id, data]) => ({ id, ...data }));
  docs = docs.filter(d => where.every(w => matches(d, w)));
  // Firestore excludes documents missing the ordered field.
  if (orderBy) {
    docs = docs.filter(d => d[orderBy[0]] !== undefined);
    const dir = orderBy[1] === 'desc' ? -1 : 1;
    docs.sort((a, b) => cmp(a[orderBy[0]], b[orderBy[0]]) * dir || cmp(a.id, b.id));
  } else {
    const rangeField = where.find(w => RANGE_OPS.has(w[1]))?.[0];
    docs.sort((a, b) => (rangeField ? cmp(a[rangeField], b[rangeField]) : 0) || cmp(a.id, b.id));
  }
  if (limit) docs = docs.slice(0, limit);
  return clone(docs);
}

export function createMemoryDb({ file } = {}) {
  const store = new Map(); // col -> Map(id -> data)
  if (file && fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [col, docs] of Object.entries(raw)) store.set(col, new Map(Object.entries(docs)));
  }
  let saveTimer = null;
  function scheduleSave() {
    if (!file) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const out = {};
      for (const [col, docs] of store) out[col] = Object.fromEntries(docs);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(out));
      fs.renameSync(tmp, file);
    }, 150);
  }

  // Serialise every write path so transactions behave like Firestore's.
  let chain = Promise.resolve();
  function exclusive(fn) {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }

  const newId = () => crypto.randomBytes(15).toString('base64url').replace(/[-_]/g, 'x').slice(0, 20);
  const coll = (col) => { if (!store.has(col)) store.set(col, new Map()); return store.get(col); };

  function applyWrites(writes) {
    for (const w of writes) {
      const c = coll(w.col);
      if (w.type === 'create') {
        if (c.has(w.id)) { const e = new Error('Document already exists'); e.code = 'ALREADY_EXISTS'; throw e; }
      }
      if (w.type === 'update' && !c.has(w.id)) { const e = new Error(`No document to update: ${w.col}/${w.id}`); e.code = 'NOT_FOUND'; throw e; }
    }
    for (const w of writes) {
      const c = coll(w.col);
      if (w.type === 'create' || (w.type === 'set' && !w.merge)) c.set(w.id, clone(stripUndefined(w.data)));
      else if (w.type === 'set') c.set(w.id, deepMerge(c.get(w.id) || {}, clone(stripUndefined(w.data))));
      else if (w.type === 'update') c.set(w.id, { ...c.get(w.id), ...clone(stripUndefined(w.data)) });
      else if (w.type === 'delete') c.delete(w.id);
    }
    scheduleSave();
  }

  const db = {
    kind: file ? 'file' : 'memory',
    newId,
    async get(col, id) {
      const d = store.get(col)?.get(id);
      return d ? { id, ...clone(d) } : null;
    },
    async query(col, opts) { return runQuery(store, col, opts); },
    async create(col, id, data) {
      id = id || newId();
      await exclusive(() => applyWrites([{ type: 'create', col, id, data }]));
      return id;
    },
    async set(col, id, data, { merge = false } = {}) { await exclusive(() => applyWrites([{ type: 'set', col, id, data, merge }])); },
    async update(col, id, data) { await exclusive(() => applyWrites([{ type: 'update', col, id, data }])); },
    async delete(col, id) { await exclusive(() => applyWrites([{ type: 'delete', col, id }])); },
    async runTransaction(fn) {
      return exclusive(async () => {
        const writes = [];
        const assertReadable = () => { if (writes.length) throw new Error('Firestore transactions require all reads before writes.'); };
        const tx = {
          async get(col, id) { assertReadable(); return db.get(col, id); },
          async query(col, opts) { assertReadable(); return runQuery(store, col, opts); },
          create(col, id, data) { id = id || newId(); writes.push({ type: 'create', col, id, data }); return id; },
          set(col, id, data, { merge = false } = {}) { writes.push({ type: 'set', col, id, data, merge }); },
          update(col, id, data) { writes.push({ type: 'update', col, id, data }); },
          delete(col, id) { writes.push({ type: 'delete', col, id }); }
        };
        const result = await fn(tx);
        applyWrites(writes);
        return result;
      });
    },
    // Test/dev helper only.
    _dump() { const out = {}; for (const [c, docs] of store) out[c] = Object.fromEntries(docs); return clone(out); }
  };
  return db;
}
