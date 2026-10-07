# Data and privacy

Startree is a single-owner application. Cloudflare Access protects remote access to the entire application. Startree does not implement public sign-up or multi-owner tenancy.

## Server storage

Cloudflare D1 is the authoritative bookmark store. Bookmark titles, URLs, folder names, tags, and annotations are not browser-encrypted.

The separate Notes page encrypts notebook content before upload. Cloudflare still sees encrypted payload sizes and synchronization timing. See the [encryption trust boundary](encrypted-notes-design.md#cryptography-and-trust-boundary).

API responses are private and non-cacheable.

## Browser storage

IndexedDB retains compatible bookmark snapshots, navigation state, unresolved operations, and the ten most recently opened bookmark IDs. Recent activity stays in that browser and can be cleared from **Recently opened**.

Structured bookmark data does not go into Cache Storage, localStorage, or sessionStorage. The service worker caches application assets for offline use. Notes uses a separate IndexedDB database for encrypted copies and pending drafts; decrypted notes stay in memory while unlocked.

Offline access means that an already retained library can remain readable without an active network connection. Protect the browser profile and device as well as the hosted application.

## Diagnostics

Logs and shared diagnostics must not contain bookmark titles, URLs, folder names, tags, notes, cookies, Access headers, or request bodies. Use synthetic data for screenshots, tests, and performance measurements.

See [operations](operations.md) for authentication checks and incident handling.
