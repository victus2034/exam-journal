# Shiva's Exam Journal: standalone app

This is your own copy of the journal. It runs on GitHub Pages (free) and syncs with Firebase (free). It does not need Claude.

- **Without setup:** open `index.html` and it saves on that device only.
- **With setup (about 10 minutes, once):** sign in with Google on your phone, iPad and laptop and everything syncs live.
- **Backup button:** downloads all your data as one file, and can restore it on any device.

---

## Part 1: Put the site online (GitHub Pages)

1. Sign in at https://github.com (create a free account if you don't have one).
2. Top right **+** → **New repository** → name it `exam-journal` → **Public** → **Create repository**.
3. Tell Claude the repository name. Claude uploads the files for you.
   - Or do it yourself: click **uploading an existing file**, drag in every file from this folder, then click **Commit changes**.
4. In the repository, go to **Settings** → **Pages** → **Source: Deploy from a branch** → Branch **main**, folder **/ (root)** → **Save**.
5. After about 1 minute your site is live at `https://YOUR-USERNAME.github.io/exam-journal/`.

## Part 2: Turn on sync (Firebase)

1. Go to https://console.firebase.google.com → **Create a project** → name `exam-journal` → turn Google Analytics **off** → **Create**.
2. Left menu **Build → Authentication** → **Get started** → **Google** → **Enable** → pick your email → **Save**.
3. Still in Authentication → **Settings** tab → **Authorized domains** → **Add domain** → `YOUR-USERNAME.github.io`.
4. Left menu **Build → Firestore Database** → **Create database** → location **asia-south1 (Mumbai)** → **Start in production mode** → **Create**.
5. In Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules` → **Publish**. This makes sure only you can read your data.
6. Gear icon → **Project settings** → **Your apps** → click the **</>** (Web) icon → nickname `journal` → **Register app**.
7. Copy the `firebaseConfig = { … }` block it shows and send it to Claude.
   - Or paste it yourself into `config.js`.
   - This config is not a password. It is safe on a public site, because the rules from step 5 protect your data.

## Part 3: Use it on every device

1. Open `https://YOUR-USERNAME.github.io/exam-journal/` on your laptop, iPad and phone.
2. Tap **Sign in to sync** and use the **same Google account** everywhere. The badge changes to **Synced**.
3. On iPhone or iPad, open the site in Safari → **Share** → **Add to Home Screen**. On Android, open it in Chrome → **⋮** → **Install app**.
4. It works offline too. Changes sync when you're back online.

**Tip:** anything you ticked before signing in is uploaded the first time you sign in.
