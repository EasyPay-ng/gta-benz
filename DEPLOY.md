# Deploying the city server — the browser-only route

No terminal. Everything happens in two websites you already have: **GitHub** and
**Cloudflare**. Total time about 8 minutes, and it costs nothing.

You are doing one thing: putting the little server that lives in `server/` onto Cloudflare's
free network, so the game has somewhere permanent to keep accounts and saves.

> **Why this is needed:** GitHub Pages only serves files. It cannot hold an account, a wallet
> or a WebSocket connection. That is the job of the Worker you are about to deploy.

There are four stages. Do one, then move to the next. If a screen does not look like the
description, stop and compare — the wording on Cloudflare changes now and then.

---

## Stage 1 — The two secrets Cloudflare needs to give GitHub permission

GitHub has to prove to Cloudflare that it is allowed to publish your Worker. It does that
with two values, stored as **secrets** (encrypted, never shown again).

### 1a. Copy your Account ID

1. Go to <https://dash.cloudflare.com> and sign in.
2. In the left menu, click **Workers & Pages**.
3. Look at the **right-hand side** of the page. There is a box headed **Account ID** with a
   long string like `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`.
4. Click the copy icon next to it.
5. Paste it somewhere safe for a minute — Notepad, Notes, anywhere. Label it **ACCOUNT ID**.

> **The fastest way — it is already on screen.** Look at your browser's address bar while you
> are anywhere in the Cloudflare dashboard. It reads:
>
> ```
> dash.cloudflare.com/2ac2442acdfcd12169021b6402e3d06c/workers/services/view/...
>                     └──────────── that is the Account ID ───────────┘
> ```
>
> 32 characters, letters and numbers. Copy it straight from the address bar. The "Account ID"
> box with the copy button is on the **Workers & Pages overview** page (right-hand side); it is
> *not* shown once you have clicked into an individual Worker.

> An Account ID is not a secret — it appears in dashboard URLs and is safe to share. The **API
> token is a secret**: never paste it into a chat, an issue, or a screenshot. Only into the
> GitHub secret box in Stage 2.

### 1b. Create an API token

1. Still in Cloudflare, click your **profile icon** (top right, a circle with your initial).
2. Click **My Profile**.
3. In the left menu of that page, click **API Tokens**.
4. Click the blue **Create Token** button.
5. You now see a list of templates. Find the one called **Edit Cloudflare Workers** and click
   **Use template** on that row.
6. On the next screen, scroll down to **Account Resources**. You will see two boxes and a red
   **"Choose an account resource"** error. This is normal — the template cannot guess your
   account yet.
   1. Leave the left box on **Include**.
   2. Click the **Select…** box on the right. A dropdown opens listing your account
      (it looks like `yourname@gmail.com's Account`).
   3. Click your account. **The red error disappears.**
7. Now look at **Zone Resources**, which shows a similar red **"Choose a zone resource"**.
   A "zone" is a domain name, and you probably own none — which is fine, Workers do not need
   one.
   1. Click the **middle** box (it says **Specific zone**) and choose
      **All zones from an account**.
   2. Click the **Select…** box and pick your account again.
   3. If the dropdown is empty because you have no domains, that is still correct — the
      selection is what matters, not the number of zones.

   > **If it refuses to accept a zone at all:** skip the template. Click **Create Custom
   > Token** instead (bottom of the API Tokens page) and add only these three permissions,
   > all of which are account-level, so the Zone section stays empty and valid:
   > `Account` → `Workers Scripts` → `Edit`,
   > `Account` → `Durable Objects` → `Edit`,
   > `Account` → `Account Settings` → `Read`.
   > Then set **Account Resources** to `Include` → your account and create it.
8. Scroll to the bottom and click **Continue to summary**.
9. On the summary you will see a list of **Permission policies**. What matters:
   - **`Workers Scripts: Edit`** — this is the one that lets wrangler upload the Worker
     *and create its Durable Object classes*, because those are declared as migrations
     inside the script you upload.
   - **`Account Settings: Read`** — lets the deploy confirm which account it is talking to.
   - Lines for KV, R2, Pages, Containers and so on are part of the template and harmless.
   - You may or may not see a separate **`Durable Objects: Edit`** line. **Either is fine** —
     it is not needed for this deploy. If the run ever fails with a Durable Objects
     permission message, come back and add it, but expect not to need it.
10. Click **Create Token**.
11. Cloudflare shows the token value **once, right after you create it**. Click **Copy** and
    paste it next to your Account ID. Label it **API TOKEN**.

> **How to tell where you are.** If the page has a green **Create Token** button at the bottom,
> the token has not been made yet — click it and copy the value on the next screen. If the page
> instead shows the token's permissions with **Edit** / **Delete** / **Roll** buttons, the token
> already exists and its value is gone from view: click **Roll**, which generates a fresh value
> and shows it once, and copy that.

> **If the token is lost:** you cannot see it again. Use **Roll**, or create another one — the
> old one can be deleted from the same page.

> **If you cannot use the template:** click **Create Custom Token** instead and add exactly
> three permissions:
> `Account` → `Workers Scripts` → `Edit`,
> `Account` → `Durable Objects` → `Edit`,
> `Account` → `Account Settings` → `Read`.
> Set **Account Resources** to `Include` → your account. That is enough.

You should now have two strings on your clipboard history:

```
ACCOUNT ID   a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
API TOKEN    a long string, often 40+ characters
```

---

## Stage 2 — Give them to GitHub

1. Open your repository: <https://github.com/EasyPay-ng/gta-benz>
2. Click **Settings** (the tab along the top, far right).
3. In the left menu, scroll down to **Secrets and variables** and click it, then click
   **Actions**.
4. You are on a page with two tabs: **Secrets** and **Variables**. Stay on **Secrets**.
5. Click the green **New repository secret** button.
6. **Name:** type exactly

   ```
   CLOUDFLARE_API_TOKEN
   ```

   **Secret:** paste your API TOKEN. Click **Add secret**.
7. Click **New repository secret** again.
8. **Name:** type exactly

   ```
   CLOUDFLARE_ACCOUNT_ID
   ```

   **Secret:** paste **only the 32-character code**, nothing else. Not the whole address
   bar. It is the part between `dash.cloudflare.com/` and the next `/`:

   ```
   dash.cloudflare.com/2ac2442acdfcd12169021b6402e3d06c/workers/…
                       └──────── this ────────┘
   ```

   Just that middle piece — 32 characters, letters and numbers. Click **Add secret**.

   > If you paste the whole URL, the workflow stops immediately with
   > *"CLOUDFLARE_ACCOUNT_ID does not look like an account id… Found 94 characters."*
   > Nothing breaks; just edit the secret (Secrets → the pencil → Update) and re-run.

You should now see both names listed. You will not be able to view their values again — that
is normal and correct.

> Names are case-sensitive and must match exactly, including the underscores.

---

## Stage 3 — Press the button

1. In your repository, click the **Actions** tab.
2. In the left-hand list you should see **Deploy the city server**. Click it.
3. On the right, click the **Run workflow** dropdown button, then the green
   **Run workflow** button in the little box that appears.
4. Wait about a minute, then **refresh the page**. A run appears in the list — click it.
5. Click the **deploy** job on the left to watch the steps tick by.

### If it turns green ✅

Scroll to the bottom of the run page. There is a section headed **"Your city server is live"**
with a line that looks like:

```
https://metroventure-city.your-subdomain.workers.dev/ws?room=metro-1
```

**That is your server address.** Copy it. It is the thing the game has been asking for.

Test it yourself: open `https://metroventure-city.your-subdomain.workers.dev/health` in a new
tab. You should see something like:

```json
{"ok":true,"service":"metroventure-city","rooms":"durable-objects","now":1792862547822}
```

### A note about the Worker you may already have made

If your Cloudflare dashboard already shows a Worker called **`gta-benz`** (created from the repo
through Cloudflare's "Connect to Git" flow), it says **"No URLs enabled"** and **"Bindings 0"**.
That Worker cannot work, and it is not the one this guide deploys:

| | the `gta-benz` Worker | this workflow's Worker |
|---|---|---|
| built from | the repository **root** | **`server/`** |
| reads `server/wrangler.jsonc` | ❌ | ✅ |
| Durable Objects (`CITY_ROOM`, `ACCOUNTS`) | **0** | both |
| public URL | none | `*.workers.dev` |

Because it has no bindings, it has no rooms and no accounts — the game could not use it even if it
had a URL. **Leave it alone for now.** It costs nothing and does not interfere with
`metroventure-city`. Once the real one is live and working, delete it from
Workers & Pages → `gta-benz` → Settings → Delete, to avoid confusion later.

### If it turns red ❌

Open the failing step and read the message. The run summary lists the four usual causes:

| Message contains | What to do |
|---|---|
| `Missing secret(s)` | Stage 2 did not save, or the name has a typo. Redo Stage 2. |
| `Authentication error`, `10000`, `Invalid API Token` | The token is wrong, or was copied with a space. Make a new one in Stage 1b. |
| `code: 10007` / *"This Worker does not exist on your account"* | A race inside Cloudflare on a brand-new Worker: the upload succeeds, then the very next API call arrives before Cloudflare can see it. The workflow now retries this automatically (10 s, 20 s, 40 s). If it still gives up, press **Re-run all jobs** — nothing is wrong with the repo, the token or the account. |
| `workers.dev subdomain` | Your account has never had a Worker. In Cloudflare open **Workers & Pages**, click any **Create**/setup prompt once to claim a `*.workers.dev` subdomain, then run the workflow again. |
| `node --test` failed | The server's own tests caught a problem. The deploy was stopped on purpose. Tell me and I will look. |

---

## Stage 4 — Point the game at it (and make it permanent)

### Fast: use it right now

Open the game, and paste your server address into the card:

```
https://easypay-ng.github.io/gta-benz/
```

It is remembered on that device, so you only do it once per browser.

### Permanent: make the public link work for everybody

1. GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click the **Variables** tab (the second tab, next to Secrets).
3. Click **New repository variable**.
4. **Name:** exactly

   ```
   CITY_SERVER_URL
   ```

   **Value:** your server address, the whole thing ending in `/ws?room=metro-1`.
5. Click **Add variable**.
6. Now rebuild the site: **Actions** tab → **Deploy MetroVenture 3D to GitHub Pages** →
   **Run workflow** → green **Run workflow**.

When that run finishes, `https://easypay-ng.github.io/gta-benz/` goes straight in with no card,
no typing — for you and for anyone you send the link to.

---

## What it costs

Free. The Workers **Free** plan allows 100,000 requests per day and a Durable Object free tier
of 13,000 GB-seconds per day. At 5 Hz, one player costs a quarter of a request per second, so
the free allowance is roughly **111 player-hours a day**. Above that, the world stops until
00:00 UTC rather than charging you anything — that is deliberate, and the game says so.

## What is now permanent

- your account (name + PIN) and your save — they survive closing the browser, changing device,
  and this repo being redeployed
- the city room, its clock and its players

Redeploying later (running Stage 3 again) does **not** wipe any of it: Durable Object storage
lives outside the Worker code.
