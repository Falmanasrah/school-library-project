# School Library System: publishing guide

One website, three separate apps and a download page, all sharing one secure server API.

| Address | What it is | Who uses it |
|---|---|---|
| `/` | **Teachers App** ("Library Booking") | Teachers book library periods |
| `/library/` | **Library Teachers App** with the Admin Panel | Library staff and administrators |
| `/supervisors/` | **Floor Supervisors App** | Floor supervisors send permission slips |
| `/download/` (also `/get`, `/install`) | **Download page** with the QR code and USB kit | Anyone. No account needed |
| `/api/rpc` | The server API (Vercel serverless function) | Only the apps |

Browsers never talk to the database directly. Every request goes through `/api/rpc`, which checks the sign-in, the role (teacher, librarian, supervisor, admin), the account status (active, suspended, banned) and the booking period on the server, and writes the audit log.

---

## 1. One-time setup

### 1.1 Firebase (the database)

1. Open the [Firebase console](https://console.firebase.google.com) and choose the project. The existing project works fine.
2. **Build → Firestore Database**: make sure a database exists (production mode).
3. **Project settings → Service accounts → Generate new private key**. This downloads a `.json` file. Keep it secret and never put it in the repository.
4. **Publish the locked-down rules.** In **Firestore → Rules**, replace everything with the contents of [`firestore.rules`](firestore.rules) and click **Publish**.
   - These rules block all direct browser access.
   - This matters: the rules on the live project today are **open**. Anyone with the old app's address can read and change the old bookings until you publish them.

The new system stores everything in collections that start with `sls_` (for example `sls_users`, `sls_bookings`). The old app's `bookings` collection is never read or changed. Once the new system is running you can delete the old collection from the console, or keep it as an archive. To use a different prefix, set `FIRESTORE_COLLECTION_PREFIX`.

### 1.2 Vercel settings

In **Vercel → your project → Settings → Environment Variables**, add these for **Production** (and Preview if you use it):

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | The whole content of the service-account `.json` file, pasted as is (base64 also works) |
| `ADMIN_SETUP_KEY` | A long random secret (20+ characters). It is used once, to create the first administrator |

Then **redeploy** (Deployments → ⋯ → Redeploy) so the function picks them up.

Without `FIREBASE_SERVICE_ACCOUNT` the server refuses to run in production. It never falls back to temporary storage, so no data can silently disappear.

### 1.3 First library teacher (full administrator)

1. Open `https://YOUR-SITE/library/`.
2. A one-time box asks for the **setup password**. Paste the `ADMIN_SETUP_KEY` value (not `PROXY_SECRET`).
3. Enter **her own** name, username and password (email is optional).

Setup works only once. After that the box never appears again. You can then remove `ADMIN_SETUP_KEY` from Vercel, or keep it secret.

**If you see "Protected Deployment" or a Vercel login page:** that is Vercel's own lock, in front of the app. In **Vercel → your project → Settings → Deployment Protection**, turn off **Vercel Authentication** and **Password Protection**, then **Save**.

### 1.4 Check that everything works

In the Library app go to **Admin → Overview → Run health check**. It writes a test record to the database and reads it back, then shows:
- the storage type (it must say `firestore`)
- the response time
- the school date and time in the school's time zone

### 1.5 Set up the school

All of this is in **Admin**:

- **Settings:**
  - school name in English and Arabic
  - time zone (default `Asia/Amman`)
  - allowed email domains for self-registration
  - whether registration is open
  - whether teachers and supervisors are approved automatically
  - whether a student ID is required on permission slips
- **Accounts:**
  - create library teachers and floor supervisors, or approve people who registered themselves
  - everyone chooses their own username and password when they register; accounts made in Admin get a temporary username and password, and the person picks their own at first sign-in
  - library teachers have every administrator power
- **Booking periods:** open the first booking period.
  - Each period lasts exactly **7 days** and closes automatically. It cannot be extended or bypassed, only closed early.
  - Teachers can only book while a period is open, and only dates inside its booking range.
  - An administrator opens the next period. It can start immediately or at a set time.

### 1.6 Free second address (when `.vercel.app` is blocked)

Some internet providers cut **every** address that ends in `.vercel.app` ("connection was reset"). A browser with a VPN still gets through, which is why it can seem to work in one Chrome profile and not another. A free Cloudflare Worker gives the site a second address, such as `https://school-library.NAME.workers.dev`, and forwards everything to Vercel from Cloudflare's side. The apps, the server and the database stay on Vercel; nothing is stored at Cloudflare.

1. **The shared secret.** Use the value in `.data/PROXY_SECRET.txt` (made locally and never uploaded), or any long random value of 16+ characters.
2. **Cloudflare:**
   1. Sign up for free at <https://dash.cloudflare.com>.
   2. Open **Workers & Pages → Create → Start with Hello World!** Name it `school-library`, then **Deploy**. The first time, Cloudflare asks you to pick your `workers.dev` name.
   3. Click **Edit code**, delete everything, paste the whole of [`cloudflare/worker.js`](cloudflare/worker.js), then **Deploy**.
   4. Open **Settings → Variables and Secrets → Add**: type **Secret**, name `PROXY_SECRET`, value = the shared secret. Then **Deploy**.
3. **Vercel:** in **Settings → Environment Variables** add `PROXY_SECRET` with **the same value**, then **Redeploy**.
4. **Check:** open `https://school-library.NAME.workers.dev/api/rpc`. It must show `"secondAddress":"ok"`. If it says the secret is not the same, copy the value again in both places.
5. **Use it:**
   - Give people the new address, or open its `/download/` page: the QR code and USB kits made there use the new address.
   - Remake the ready folders: `npm run kits -- https://school-library.NAME.workers.dev`
   - People who used the old address sign in once more on the new one.

Good to know:
- The server still blocks other websites and still counts failed sign-ins per person: the Worker passes on each visitor's real IP, and the server believes it only with the shared secret.
- The free Cloudflare plan allows 100,000 requests a day. An open app checks for changes every 6 seconds while it is on screen (about 600 requests an hour). If the school ever reaches the limit, Cloudflare's paid Workers plan is $5 a month.
- The old `.vercel.app` address keeps working for everyone whose provider does not block it.

---

## 2. Publishing an update

```bash
npm run release
```

This bumps the version (2.0.0 → 2.0.1) in every file that carries it. Use `npm run release -- minor` or `npm run release -- 2.3.0` for other bumps. Then commit and push or deploy as usual.

Every installed app checks `/version.json`, installs the new version in the background and reloads itself. Nobody has to reinstall anything.

Before publishing, run the tests:

```bash
npm test
```

---

## 3. Getting the apps onto devices

- **Ready folders:** `ready-for-pcs/` has one folder (and one .zip) per app. Copy the one a PC needs and double-click `Install.cmd`. They open https://school-library-project-nu.vercel.app; if the address changes, run `npm run kits -- https://new-address`.

- **QR code:**
  - open `https://YOUR-SITE/download/` and click **Print QR poster** (A4, English and Arabic)
  - or **Save QR image** to put it in a newsletter or slide
  - the QR can point to the download page or straight to one app
- **Phones, tablets and computers:** scan or open the page, open your app, then tap **Install**. The page shows the steps for Android, iPhone/iPad, Windows, Mac and Chromebook.
- **USB stick (Windows school computers):**
  1. On the download page click **Download kit with all three apps**, or a single app.
  2. Unzip it onto a USB stick.
  3. On each computer, double-click `Install.cmd`.
  - The installer creates Start menu and desktop shortcuts that open the app in its own Edge/Chrome window. It needs no administrator rights.
  - `Uninstall.cmd` removes the shortcuts.
  - If scripts are blocked on a computer, the `Open … .url` files in the kit still work.
  - The kit links to the website it was downloaded from, so make it from the real published address, not from a preview link.

Downloading and installing need no account. Seeing any school data needs a school account.

---

## 4. "This site is not secure" / blocked on the school network

### What was changed in the code

**Before**, the app:
- loaded scripts from other websites
- used inline scripts
- talked to Firebase directly from the browser with open database rules
- had test accounts and passwords visible in the page source

Web filters treat that pattern as risky, and pages with a password form on a shared hosting domain are a common phishing pattern.

**Now:**
- **HTTPS is forced**: HSTS and `upgrade-insecure-requests`.
- **Strict Content Security Policy**: only this site's own files can run, with no third-party scripts or inline code. The QR generator is included in the site, not loaded from a CDN.
- **Security headers:** `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` (see [`vercel.json`](vercel.json)).
- **No passwords or test accounts** anywhere in the code. Passwords are hashed on the server (scrypt), and sign-ins are rate-limited and locked after repeated failures.
- **The database is closed to browsers** (see 1.1, step 4).

### What only the school can do

The block itself is decided by the school's web filter (for example FortiGuard, Cisco Umbrella, Securly, Lightspeed, GoGuardian or Sophos), not by the website. Many filters block **all** new or "unrated" `*.vercel.app` sites, however secure they are. To fix that:

1. **Use the free second address** (see 1.6). This also fixes internet providers that block `.vercel.app` at home.
1. **Ask school IT to allow the address.** Give them the exact domain (for example `your-site.vercel.app`).
2. **Use a custom domain** (Vercel → Settings → Domains), ideally a subdomain of the school's own domain such as `library.yourschool.edu.jo`. Filters and IT trust the school's own domain, and the address is easier to type.
3. **Ask the filter vendor to re-categorise the site** as *Education*. Most vendors have a free form, for example FortiGuard's *Web Filter Lookup*, Cisco Talos *Reputation Center* and Palo Alto *URL Filtering* "Test A Site". School IT can tell you which filter they use.
4. **Check Google Safe Browsing** at <https://transparencyreport.google.com/safe-browsing/search>. If the site is flagged, add it to Google Search Console and request a review.
5. **Always share the `https://` address.** The QR poster and USB kit already do.

If the browser shows a **certificate** warning only on the school network, the filter is inspecting HTTPS traffic with its own certificate. Only school IT can fix that, by installing their certificate on school devices or excluding this site.

---

## 5. Working on the code locally

```bash
npm install
```

```bash
npm run dev
```

- **Local server:** http://localhost:8080. Local data is kept in `.data/dev-db.json`, which is never deployed.
  - The local setup key is set in `scripts/dev-server.mjs`. Use it for **First-time setup** on your computer only.
- **Tests:** `npm test` runs the full workflow:
  - accounts, roles, bans and suspensions
  - booking periods and slot conflicts
  - visits, visitors and permission slips
  - the audit log
  - the download kit and QR codes
  - the version check
  - the Firestore adapter
- **App icons:** `npm run icons` redraws them (no extra tools needed).
- `download/vendor/qrcode.js` is the MIT-licensed `qrcode-generator` 1.4.4, copied from `node_modules`.

### Notes

- The school week is Sunday to Thursday. Check-in and slips use the school's time zone, not the device's.
- The Firestore adapter is tested against a stand-in for Firestore, because the official emulator needs Java. After the first deploy, use the health check (1.4) to confirm the real database works.
