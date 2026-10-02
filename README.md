# Station 07

An original fire officer interpretation of the themed loading and interactive 3D portfolio flow at https://www.jesse-zhou.com/.

## Run locally

Requires Node.js 22.12+.

```sh
npm install
npm run dev
```

Open http://localhost:3000. On Windows with restricted PowerShell scripts, use `npm.cmd` instead of `npm`.

```sh
npm run build
npm start
```

`PORT` sets the server port. The Node backend serves Vite in development and the built frontend in production.

## Customize

Edit `data/profile.json` for officer name, location, biography, service history, and training. The portfolio identifies Kaushlendra Singh Chauhan as a current Fire Officer at SBI; additional training remains a placeholder. The custom fire truck and station are built from Three.js geometry in `src/main.js`; there are no external model assets. Fonts have local sans-serif fallbacks.

## Backend

- `GET /api/health`: health status.
- `GET /api/profile`: portfolio content.
- `POST /api/contact`: validated JSON `{name,email,message}`, stored in `data/messages.ndjson`. Five messages per IP per ten minutes. The endpoint confirms storage, not email delivery.

Keep `data/` on persistent storage when hosting. The messages file contains personal information and is deliberately excluded from version control and public static serving. Add your desired email integration before exposing the contact form broadly.

## Fire Vault

Run the local setup command once, choose two different passwords of at least 12 characters, and restart the server:

```sh
npm run vault:setup
```

On PowerShell use `npm.cmd run vault:setup`. Passwords are entered in hidden terminal prompts. There are no default credentials or public registration endpoints. Until setup is complete, the vault remains locked.

- **View documents:** enter the shared viewer password supplied by the officer. Viewers can preview documents, see saved highlights, and download original or highlighted copies.
- **Officer management:** enter the separate officer password to upload and delete documents, save highlights, or change the shared password.
- Changing the shared password immediately invalidates all current viewer sessions. Anyone who knows the shared password can access all documents; shared access does not identify individual viewers.
- Files supported: PDF, UTF-8 TXT, PNG and JPG, maximum 10 MB per file. Documents appear as tiles and download as attachments. File extension and content signatures are checked; antivirus scanning is not included.
- Passwords are salted and hashed using scrypt. Sessions use random server-side tokens, HttpOnly and SameSite=Strict cookies, eight-hour expiry, and CSRF verification for mutations. Repeated login attempts are limited by IP.
- `.vault/index.json` and `.vault/files/` are private server storage, excluded from Git and blocked by both server routing and Vite filesystem rules. Files are not encrypted on disk; restrict OS access and use encrypted disk/backups for sensitive material.
- Run one server process with a persistent private `.vault/` directory. Sessions expire on server restart; passwords and documents persist. Stop the server before backing up the entire directory. Keep both passwords with the officer; this initial version has no password-recovery workflow.

### Private Google Drive documents

The vault can read documents from a private Google Drive folder while retaining its existing viewer and officer passwords. Upload and delete files in Google Drive; the website lists, previews and downloads them through its authenticated backend. Visitors do not receive public Drive links or server credentials. When Drive is enabled, original documents are not copied into `.vault/files/`. Password hashes and saved highlights still live in `.vault/index.json`, so keep backing up that directory.

1. Create a Google Cloud project, enable the Google Drive API, and create a service account with a JSON key. See [Google's service account setup](https://developers.google.com/identity/protocols/oauth2/service-account).
2. Keep your document folder private. Share that specific folder with the service account's `client_email` as **Viewer**.
3. Save the JSON key as `.vault/google-service-account.json` on the server. Do not put it in `src`, `dist`, public hosting storage or chat. Alternatively set `GOOGLE_APPLICATION_CREDENTIALS` to its private filesystem path.
4. Restart the server after installing its credentials. Sign in to **Fire Vault → Officer management**, open **Google Drive settings**, paste the folder link, check **Use Google Drive documents**, and click **Save Drive settings**. The server verifies access before activating the folder. You can save a link with the checkbox unchecked while credentials are being set up.

Only the officer can read or update the folder configuration; both permissions and CSRF protection are checked on the server. Viewers cannot access it through the UI or API. Settings persist privately in `.vault/drive-config.json` and take effect without restarting. Existing viewer sessions are revoked when settings change. The officer can still edit the settings if the Drive library is unavailable.

The supplied folder link is prefilled, with Drive disabled until credentials are installed. For hosted production, store credentials privately and run `npm start`. Optionally, `GOOGLE_DRIVE_FOLDER_ID` supplies a default only when no saved configuration exists. The application does not automatically load `.env` files. `.env.example` lists supported environment variables.

Supported files are PDF, UTF-8 TXT, PNG and JPG, up to 10 MB, placed directly inside the chosen folder. Native Google Docs/Sheets/Slides, shortcuts and nested folders are excluded; export documents as PDF first. The website uses read-only Drive access. Officers can still edit highlights and rotate the shared vault password. Use **Refresh documents** to read new files. Replacing a Drive file's contents clears its previous highlights and increments the revision to avoid applying old highlights to new content.

With **Use Google Drive documents** unchecked, the existing local vault remains active. Enabling Drive does not delete existing local documents; it selects the Drive library instead. Connection failures show an error rather than silently switching to local documents. Read-only files and folder queries follow [Google's Drive API guidance](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

Verify the mocked Drive authentication, folder boundaries, password gating and annotations with `node --test scripts/google-drive.test.js`. These tests do not access a real Google account.

### Preview controls

Choose **Preview & highlights** on a document tile. PDFs include page controls. In officer mode, drag across a section of a PDF or image to add a highlight. Turn **Highlight mode** off to scroll on touch devices. In TXT documents, select text and click **Highlight selection**. Choose yellow, green, or pink; use Undo or Clear highlights as needed; click **Save highlights** to persist changes immediately.

Viewers see the officer's saved highlights and cannot edit them. Closing a preview with unsaved changes asks before discarding them. Revision checks prevent one open preview from silently overwriting another saved revision. Protected annotation endpoints share the vault's authentication and CSRF rules.

**Download highlighted copy** saves pending officer changes before downloading: PDFs retain their pages and content with highlights embedded; images export as highlighted PDFs; TXT files export as UTF-8 HTML with marked text. The original file is preserved. Damaged or encrypted PDFs may not render or export; their original download remains available.

PDF rendering runs locally in a bundled [Mozilla PDF.js](https://mozilla.github.io/pdf.js/examples/index.html) worker. Highlighted PDF exports use [pdf-lib](https://pdf-lib.js.org/docs/api/classes/pdfpage). Documents are not sent to an external preview service.

For hosted use, terminate TLS at your hosting provider and run `npm start`. Production cookies require HTTPS. Set `PUBLIC_ORIGIN` to the exact external origin, for example `https://your-domain.com`, when using a proxy. Keep the vault directory out of public storage and restrict direct access to the Node port. Local HTTP development is intended for trusted devices; use HTTPS for real shared access. This is a personal portfolio feature, not an SBI-approved document system.

Implementation references: [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) and [Node.js crypto documentation](https://nodejs.org/api/crypto.html).

## Experience

Use the **360°** control to rotate around the station, or drag the scene manually. The sky wraps around the camera and surrounding buildings continue in every direction. Reset stops automatic rotation and restores the starting viewpoint.

The extinguisher welcome screen stays visible until the visitor clicks **Start exploring**. The scene then opens with a fire in the open area beside the station. The truck drives over with emergency lights, then its roof hose sprays water for seven seconds to extinguish the flames. The **water drop** control pauses or resumes water and replays the response after completion. Wet ground remains after extinguishing. The separate burning building has been removed.

The response has no smoke or audio effects. Opening a dialog pauses the response. Reduced-motion mode uses steady flames and a shorter truck approach. Run `node scripts/check-response.js` to verify movement, water controls, extinguishing and replay.

Drag to orbit, scroll to zoom, click the truck or hotspots to explore, toggle emergency lights, and reset the camera. Emergency lights cast alternating red and blue light onto the station and across the page. The glow follows the projected truck lamps as the camera moves. Reduced-motion mode uses a steady glow. The 3D scene stops drawing while a dialog is open to leave rendering resources available for document previews. Responsive layout, keyboard navigation, dialog focus management, and a WebGL fallback are included.

## Verify

```sh
npx playwright install chromium
npm test
```

Browser tests cover desktop and mobile startup, WebGL canvas rendering, portfolio dialogs, emergency light controls, contact form visibility, vault password gating, and document tiles. Isolated backend tests cover authorization, CSRF checks, file validation, protected downloads, password rotation, logout, and private-storage exposure. Tests never create real vault credentials or upload documents to the officer's vault.

GitHub Pages: run npm run build:pages and publish the dist directory on the gh-pages branch. This static build includes the public officer profile; Fire Vault and contact submissions require the Node server and are unavailable on Pages. Never publish .vault or service-account credentials.
