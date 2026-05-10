# Client Partner Video Interview - Vercel

This is a Vercel-ready version of the video interview app. It avoids the Google Apps Script iframe, which is commonly where browser camera permissions get awkward.

## Deploy

1. Create a Google Cloud service account.
2. Enable the Google Drive API and Google Sheets API.
3. Create a Google Drive folder for videos and share it with the service account email as Editor.
4. Create a Google Sheet and share it with the service account email as Editor.
5. In Vercel, import this `vercel-deploy` folder as the project root.
6. Add the environment variables from `.env.example`.
7. Deploy.

## Links

- Candidate link: `https://your-domain.vercel.app/`
- Admin link: `https://your-domain.vercel.app/?mode=admin&token=YOUR_ADMIN_TOKEN`

Admin mode lets you upload, record, preview, and replace question prompt videos. Prompt video IDs are saved automatically in a `Prompt Videos` sheet tab, so you do not need to add `PROMPT_Q*_ID` environment variables or redeploy after changing prompts.

Candidate mode records answers and writes the final row to Google Sheets.
