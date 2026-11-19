# Occra: setup and deploy guide

Occra has two parts:

- **site**: the web app (HTML, CSS and JS), hosted on Cloudflare Pages.
- **api**: a small Cloudflare Worker that keeps the YouTube API key on the server and caches search results, so users don't need their own key.

## Prerequisites

- Node.js (LTS)
- A Cloudflare account (free)
- A Google account (to get the YouTube API key)

## 1. Folder layout

```
occra/
├── site/
│   ├── index.html
│   ├── style.css
│   ├── config.js    ← the only file you edit (Worker URL, Google Client ID, contact email)
│   └── app.js       ← all of the app logic
└── api/
    ├── worker.js
    └── wrangler.toml
```

Keep them separate so `worker.js` and `wrangler.toml` are not uploaded along with the site.

When you receive an update, you only need to replace `index.html`, `style.css` and `app.js`. Keep your own `config.js` so you don't have to paste your settings again.

## 2. Get a YouTube API key

1. Go to https://console.cloud.google.com and create a new project.
2. Open **APIs & Services → Library**, search for "YouTube Data API v3" and click **Enable**.
3. Open **Credentials → Create credentials → API key**.
4. Click the new key and, under **API restrictions**, allow only the YouTube Data API v3.

## 3. Deploy the Worker (the API)

```bash
cd occra/api
npm i -g wrangler
wrangler login
wrangler secret put YT_KEY      # paste the API key when prompted
wrangler deploy
```

- If asked to create a new Worker named `occra-api`, choose Yes. The first time, you may also be asked to register a `workers.dev` subdomain.
- At the end it prints a URL like `https://occra-api.<your-name>.workers.dev`.
- To check it, open `<URL>/search?q=lofi` in a browser. If you see JSON, the Worker is working.
- A brand-new `workers.dev` subdomain can take a few minutes before its SSL certificate is ready. If you get an SSL error (for example `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`), wait 5 to 15 minutes and try again.

## 4. Point the site at your Worker

Open `site/config.js` and find this line:

```js
var API='https://YOUR-WORKER.workers.dev';
```

Replace the URL with your Worker's URL.

Still in `site/config.js`, set the contact shown in the in-app Help guide (the "Can't sign in? Contact the developer" note) so friends know who to ask:

```js
var CONTACT='you@example.com';
```

If you leave the placeholder, the note simply says "Contact the developer" without an address.

## 5. Test locally

```bash
cd occra/site
python3 -m http.server 8000
```

Open http://localhost:8000 and try: searching for a song, pasting a video link, importing a playlist.

> Don't open `index.html` directly from disk (`file://`). YouTube may show error 153 when the page has no referrer.

## 6. Put the site online (Cloudflare Pages)

```bash
cd occra
npx wrangler pages deploy site --project-name occra
```

Your site will be at `https://occra.pages.dev`. You can also drag and drop the `site` folder in the Cloudflare dashboard (Workers & Pages → Create → Pages → Upload assets). The dashboard may steer you toward Workers instead, but the CLI command above still works. To host elsewhere, GitHub Pages also works: just upload the `site` folder.

## 7. Lock the Worker to your site

Open `api/wrangler.toml` and change:

```toml
ALLOWED_ORIGIN = "https://occra.pages.dev"
```

Use your site's exact address, with no trailing `/`. Then deploy again:

```bash
cd occra/api
wrangler deploy
```

The `YT_KEY` secret is already stored, so you don't need to enter it again.

Notes:

- The Worker accepts only **one** origin. After this step, requests from localhost will be blocked. To test locally again, temporarily set it back to `"*"`.
- This only stops other websites from using your Worker. It does not stop someone calling it directly with a tool like curl. For more protection, add a rate-limiting rule per IP in the Cloudflare dashboard (Security section), if your plan allows it.

## 8. (Optional) Sign in with Google to import private playlists

The **Import from YouTube** button lets a user sign in with Google and import their own playlists (including private ones, and Liked videos). It runs entirely in the browser and needs no Worker changes. The sign-in token lives only in the page's memory and is sent straight to Google.

Menu names in Google Cloud Console may differ slightly depending on the version of the interface:

1. In the same project as step 2, open **Google Auth Platform** (or APIs & Services → OAuth consent screen). Choose user type **External** and fill in the app name and a contact email.
2. Under **Data Access / Scopes**, add `https://www.googleapis.com/auth/youtube.readonly`.
3. Leave the publishing status as **Testing**. Under **Audience / Test users**, add your Gmail and your friends' Gmail addresses (up to 100 people). Anyone not on the list can't sign in.
4. Open **Credentials → Create credentials → OAuth client ID → Web application**. Under **Authorized JavaScript origins**, add `https://occra.pages.dev` (your site's address) and `http://localhost:8000`. After it is created, copy the **Client ID**.
5. Open `site/config.js` and replace `YOUR-CLIENT-ID.apps.googleusercontent.com` on the `var GOOGLE_CLIENT_ID=` line with the Client ID you copied.

Notes:

- In Testing mode, sign-in permission expires after 7 days, so each person has to sign in again every week. They will also see a "Google hasn't verified this app" warning (click Continue).
- Removing the 100-user cap and the 7-day expiry requires submitting the app to Google for verification. That is not worth it for a "for fun" project.
- Watch Later and watch history can't be read through the API. Liked videos can.

## YouTube quota

- The limit is 10,000 units per day for the whole project.
- Each **new** search keyword costs 100 units, which is about 100 different keywords per day. Repeated keywords are cached for 24 hours and cost nothing extra.
- Importing a playlist by link is much cheaper: about 1 unit per 50 tracks.
- When the quota runs out, search returns an error until the next day. Pasting video links and playing music keep working.
- If the site gets popular, you can apply to Google for a higher quota (free).

## How to use

- The input box on the right recognises three kinds of input: a video link or ID is added directly; a playlist link (containing `list=`) imports the whole playlist (up to 300 tracks); plain text runs a search.
- Importing by link works for public and unlisted playlists. Private playlists, Liked videos, Watch Later and auto-generated Mixes (`list=RD...`) can't be imported this way. Use the Google sign-in button (step 8) for private playlists and Liked videos.
- The **Help** button (top right, or press `?`) opens a short illustrated guide. It opens by itself the first time someone visits.
- Drag and drop, or use the ▲▼ buttons, to reorder tracks. Click the playlist name to rename it.
- Playlists are stored in each person's own browser (localStorage). They are not synced across devices yet.

## Troubleshooting

| Symptom | Common cause |
|---|---|
| "Cannot reach the server" | Wrong Worker URL, or `ALLOWED_ORIGIN` doesn't match the site's address. Run `wrangler tail` inside `api` to see live logs. |
| "API error: ... quota" | The daily YouTube quota is used up. Wait until the next day. |
| "Set API in config.js to your Worker URL first" | You haven't replaced `YOUR-WORKER` yet (step 4). |
| "Set GOOGLE_CLIENT_ID in config.js first" | You haven't completed step 8 yet. |
| A video fails to play (for example error 153) | The page was opened from `file://`. Use `http://localhost` or the deployed site instead. |
| A track is skipped automatically | The owner disabled embedding, or the video was deleted. |
| "The playlist ... cannot be found" on a link import | The playlist is private or deleted. Make it Unlisted or Public, or use the Google sign-in button. |

## Known limitations

- Ads inside YouTube's embedded player can still appear. Occra's own interface has no ads.
- The video must stay visible (the square cover art is the video, cropped), because YouTube's embed terms don't allow hiding it or separating the audio.