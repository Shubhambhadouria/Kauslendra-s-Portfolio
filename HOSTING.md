# Free backend hosting

Use Render Free for the Node service and Neon Free for PostgreSQL. Google Drive can hold the private documents; PostgreSQL stores password hashes, Drive settings, highlights and contact messages. Local uploads also persist in PostgreSQL, but count against its storage allowance. Free services have usage limits and Render sleeps after inactivity.

## Deploy

1. Create a free Neon project at https://console.neon.tech. Copy its PostgreSQL connection string from the Connect dialog, including its TLS settings. Do not post this secret in chat or GitHub.
2. Sign into https://dashboard.render.com with GitHub and use this Blueprint link:
   https://render.com/deploy?repo=https://github.com/Shubhambhadouria/Kauslendra-s-Portfolio
3. Choose Free. The template prompts for three secret environment variables:
   - DATABASE_URL: the Neon connection string.
   - INITIAL_OFFICER_PASSWORD: your officer password, 12-256 characters.
   - INITIAL_VIEWER_PASSWORD: a different viewer password, 12-256 characters.
4. Deploy. The first startup creates both accounts together in the database. Open the service HTTPS URL, enter the website, then select Fire Vault and Officer management. Enter your chosen officer password.
5. After login succeeds, remove both INITIAL_*_PASSWORD environment variables from Render. Keep DATABASE_URL. Existing accounts persist across redeploys; initial passwords do not reset an existing officer account.

Do not select a paid plan or add a disk for this setup. Use Neon for persistent storage rather than Render's temporary free PostgreSQL database. Check the providers' free usage limits. Run one backend instance. Server restarts invalidate sessions but preserve database data. Keep database backups. There is no password recovery UI yet.

## Connect private Google Drive

1. Enable Google Drive API and create a service account with a JSON key.
2. Add a Render secret file named google-service-account.json containing the key. Set GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/google-service-account.json and redeploy. Never commit the key or send it in chat.
3. Share the private folder with the service-account email as a Viewer.
4. In Officer management, open Google Drive settings, save your folder link and enable Drive:
   https://drive.google.com/drive/folders/1Fb6WOF8WVIzWGxriuzRbTiQmN-NSKbZE

Only the officer can edit the folder link. Original Drive bytes are read through the authenticated backend, not saved into PostgreSQL.

## Connect the public portfolio

The backend is https://station-07-backend.onrender.com. Fire Vault and contact buttons in the Pages build navigate to this service with the requested section. Click START EXPLORING on the hosted welcome screen to open it. Existing same-origin cookies and CSRF protection remain in place. The service origin is configured in src/main.js.

Verify /api/health, officer login, viewer restrictions, Drive settings and persistence after a restart before linking the live site. Committing the template does not deploy the backend; the hosting account and database credentials are required.

Local development still uses .vault and data/messages.ndjson when DATABASE_URL is unset. The interactive npm run vault:setup command initializes local or disk storage; use the initial password secrets for database hosting. Local vault data is not automatically migrated into PostgreSQL.
