# Private Notes

## Create a notebook

Open **Notes** and choose a separate password. Save the recovery key somewhere safe and verify it before writing.

Note titles, bodies, and saved version history are encrypted in the browser before upload. Bookmark annotations are separate and are not encrypted this way.

If you lose both the password and recovery key, you lose access to the notebook. Resetting your Cloudflare Access login cannot decrypt it.

## Save and restore versions

Click **Save** or press **Ctrl/Cmd+S** after editing. Notes does not autosave edits. The Save button becomes enabled when you make a change.

Open **History** to preview a saved version. Restoring it creates a new version without removing later history. Leaving with unsaved edits prompts you to save, discard, or keep editing.

## Work offline

Visit Notes online first so the browser retains its assets and encrypted copy. You can then unlock, read, and edit offline. Saved offline changes remain as encrypted drafts until synchronization succeeds.

The unlock screen lists unsynced drafts. If another browser has changed the notebook, use **Keep both versions** to preserve competing edits.

## Lock and recover

Refresh, leaving Notes, or 15 minutes of inactivity locks the notebook. Unsaved edits require special handling so locking does not silently discard them. See [session behavior](encrypted-notes-design.md#sessions-and-ui).

Settings provides password and recovery-key rotation and encrypted backup export. Import an encrypted backup from the unlock screen. Backups need the matching password or recovery key; rotation does not change previously exported backups.

## Limits and security

A notebook supports 500 plain-text notes and 512 KiB of serialized content, including history. Reaching the limit blocks a new save without pruning older versions.

The browser, device, and hosted application code remain trusted. The cryptography has not had an independent security audit. Read the [encryption design](encrypted-notes-design.md) for algorithms, metadata visibility, and recovery behavior.
