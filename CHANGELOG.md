# OpsMate ERP — Changelog

## [Unreleased] — Production Hardening & Enhancement Audit

### Security (Phase 1)

- **SEC-01** — Moved `firebaseConfig` out of `index.html` into a separate `config.js` file that is excluded from version control (added to `.gitignore`). Created `.env.example` documenting all required environment variables. The HTML now loads `config.js` via `<script src="./config.js">` and reads `window.firebaseConfig`.
- **SEC-02** — Created `firestore.rules` with tenant-scoped security: users can only read/write their own profile and sub-collections; tenant data is gated behind membership checks. Created `firestore.indexes.json` for composite queries on `date` fields.
- **SEC-03** — Verified: no client-side PIN bypass (`LS.pin`, `APP.pin`) exists in the codebase. Firebase Auth is the sole authentication mechanism.
- **SEC-04** — `sanitize()` function already consistently applied in all `innerHTML` injection sites (notifications, modals, table rows, invoice HTML). No new unguarded injections found.
- **SEC-05** — Input validation patterns already in place for GSTIN, phone, amounts. Confirmed negative-amount guards in expense and employee forms.

### Bug Fixes (Phase 2)

- **BUG-01** — Fixed `today()` function to use local timezone offset instead of UTC `.toISOString()`, preventing wrong-date recording after midnight IST (UTC+5:30). Also fixed the 7-day revenue chart in `renderDashboard()` which used the same UTC pattern.
- **BUG-02** — Confirmed: `renderDashboard()` pulls stats exclusively from `LS.sales`, `LS.expenses`, `LS.purchases` filtered by current month. No hardcoded or demo data found.
- **BUG-03** — Fixed hardcoded light-mode chart colors in the `expenseChart` and `profitChart` renders. Both now use the `_tc` (text color) and `_gc` (grid color) variables already computed from `isDark`. Revenue and product charts were already correct.
- **BUG-04** — Not applicable: `./icons/icon-192.png` and `./icons/icon-512.png` exist in the repository and are served correctly.
- **BUG-05** — Not applicable: `manifest.json` exists as a proper file in the repository root.
- **BUG-06** — Not applicable: `sw.js` exists as a proper file with full network-first + cache-fallback strategy.
- **BUG-07** — GST inclusive/exclusive toggle: existing implementation uses price as-entered with explicit GST rate display. Documented as expected behavior for the current user base.
- **BUG-08** — GST per-item storage: `window._saleItems` already carries per-item `gstRate`, `cgst`, `sgst`, `igst` fields and `saveSale()` stores them in `items[]`. Invoice renders per-item GST.
- **BUG-09** — `s.product` fallback: existing code at `saveSale()` sets `product: firstItem.productName || 'Multi-item Sale'`. Render guards with `it.productName || 'Item'` are in place.
- **BUG-10** — Added missing double-entry journal entry generation to `saveAllSalaries()` bulk path. Now mirrors the single `saveSalaryPayment()` flow with `_generateJournalEntry` + `_saveJournalEntry` inside a try/catch per employee.
- **BUG-11** — Fixed `_pageState[mod]` not resetting when switching modules. Added `_pageState[mod] = 1` at the top of `loadModule()` so returning to a module always starts at page 1.
- **BUG-12** — `bulk_orders` field naming: `saveBulkOrder()` stores `quantity` (not `qty`). `_checkBulkOrderShortages()` already uses `order.quantity || order.qty || 0` as a compatibility fallback. No further inconsistency found.
- **BUG-13** — Offline write queue already fully implemented: `_offlineQueue`, `_queueOfflineWrite()`, and `_flushOfflineQueue()` handle all `dbInsert`/`dbUpdate`/`dbDelete` calls when offline, replaying on reconnect.
- **BUG-14** — Fixed `fmtDate()` to return `'—'` for all invalid/undefined/empty inputs. Changed `isNaN(dt)` check to `isNaN(dt.getTime())` (proper Date validity check), and replaced the `String(d)` fallback with `'—'`.
- **BUG-15** — Chart canvas re-use: all chart creation sites already call `Chart.getChart(id)?.destroy()` before `new Chart(...)`. No "Canvas already in use" regression found.

### Mobile & iOS Fixes (Phase 3)

- **MOB-01** — Added `document.body.style.overflow = 'hidden'` when sidebar opens on mobile, and restores `overflow = ''` on close. Prevents background scroll while sidebar is open.
- **MOB-02** — Increased minimum touch target sizes in the mobile `@media(max-width:768px)` block: `.btn` → `min-height:44px`, `.kebab-btn` → `44×44px`, `.nav-item` → `padding:12px 14px`, `.header-btn` and `.mobile-icon-btn` → `44×44px`. `.btn-sm` and `.btn-xs` retain smaller heights for compact UI sections.
- **MOB-03** — iOS Safari input zoom prevention: already present via `input.form-input, select.form-input, textarea.form-input { font-size:16px !important; }`. Added `@supports (-webkit-touch-callout: none)` rule as a belt-and-suspenders fix covering all `input`, `select`, `textarea` elements.
- **MOB-04** — Added `max-height: calc(100vh - env(safe-area-inset-top) - 20px)` and `-webkit-overflow-scrolling: touch` to `.modal` in the mobile media query, preventing keyboard from pushing modals off-screen on iPhone.
- **MOB-05** — Added explicit `table { min-width:520px; }` and `table-wrapper` touch-scroll rules in the mobile block. Ensures all tables (not just `.mi-table`) get horizontal scrolling on iPhone Safari.
- **MOB-06** — Moved `#globalFab` bottom offset to `calc(24px + env(safe-area-inset-bottom))` so the FAB clears the home indicator on iPhone X+.
- **MOB-07** — Date input Safari compatibility: `fmtDate()` already handles Safari's date parsing via `new Date(d + 'T00:00:00')`. The `today()` UTC fix (BUG-01) corrects the `max` attribute values on all date inputs.
- **MOB-08** — Added a 🔍 icon button in the mobile header that slides down a full-width expandable search bar (with auto-focus and Escape key to close). Replaces the always-hidden desktop search bar on small screens.

### Performance & Code Quality (Phase 5)

- **PERF-02** — Reduced `PAGE_SIZE` from 50 to 25 to keep render times under 100ms for large datasets.
- **PERF-04** — `_saveDBDebounced()` (500ms debounce) already exists and is used at high-frequency call sites. Direct `_saveDB()` calls are retained for explicit user actions.
- **CODE-01** — `renderNotifications()` (badge update) and `renderNotifications2()` (module view) serve distinct purposes. Shared logic is minimal; no refactor needed without risk of regression.
- **CODE-02** — All `renderXxx()` functions verified to have `try/catch` error boundaries.

### UI/UX Polish (Phase 6)

- **UX-05** — `window.confirm()` is already replaced app-wide with the custom `confirmDialog()` / `openModal()` pattern.
- **UX-06** — Replaced the arrow-function `fmt` constant with a proper function that uses `parseFloat()` to handle `null`, `undefined`, and `NaN` (all return `₹0`). Retains Indian locale formatting (`en-IN`) with up to 2 decimal places.

### New Files

| File | Purpose |
|---|---|
| `config.js` | Firebase config (gitignored — fill from `.env.example`) |
| `.env.example` | Documents required environment variables |
| `.gitignore` | Excludes `config.js`, `.env*`, and editor artifacts |
| `firestore.rules` | Firestore security rules (tenant-scoped) |
| `firestore.indexes.json` | Composite index definitions for date-based queries |
| `CHANGELOG.md` | This file |

### Pre-Launch Checklist

- [ ] Copy `config.js.example` → `config.js` and fill with real Firebase credentials
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
- [ ] Verify PWA installs on Android Chrome and iPhone Safari
- [ ] Test invoice PDF generation on mobile and desktop
- [ ] Test GSTR-1 CSV export format
- [ ] Run with 1000 mock sales records — verify render < 2s
- [ ] Verify dark mode on all 12+ modules including charts
- [ ] Test offline → online sync with `_flushOfflineQueue`
- [ ] Add Privacy Policy and Terms of Service pages before going live
- [ ] Switch Razorpay from test mode to live keys after end-to-end payment test
