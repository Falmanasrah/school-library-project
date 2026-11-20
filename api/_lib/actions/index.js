// Registry of every API action. Each entry declares who may call it:
//   auth:  'public' | 'session' (signed in, any role) | 'active' (signed in, approved, has the app's role)
//   apps:  which app(s) may call it (checked against the session's app)
//   roles: which account roles may call it
import auth from './auth.js';
import bookings from './bookings.js';
import records from './records.js';
import admin from './admin.js';
import sync from './sync.js';

export const ACTIONS = Object.freeze({ ...auth, ...bookings, ...records, ...admin, ...sync });
