# Deploying SFS online (free)

SFS runs online on two free services. Neither needs a credit card.

| Service | What it does | Free tier |
|---|---|---|
| **MongoDB Atlas** | Stores user records, encrypted keys and the encrypted files (GridFS) | 512 MB |
| **Render** | Runs one server that hosts the website and the API, with HTTPS | 750 hours a month |

The server still only receives encrypted data, so moving to the cloud does not change the
zero-knowledge design. MongoDB Atlas sees the same ciphertext that `server/data/` holds locally.

## 1. Create the database (MongoDB Atlas)

1. Sign up at https://www.mongodb.com/cloud/atlas/register.
2. Create a cluster and choose the **M0 Free** tier. Pick a region near you, for example
   AWS Mumbai (`ap-south-1`) or Singapore.
3. **Database Access** > **Add New Database User**. Choose password authentication, set a
   username and a strong password, and give it the "Read and write to any database" role.
   Avoid `@ : / ? #` in the password, or URL-encode them.
4. **Network Access** > **Add IP Address** > **Allow Access from Anywhere** (`0.0.0.0/0`).
   Render's free tier has no fixed IP address, so this is required. The database is still
   protected by the username and password.
5. **Connect** > **Drivers**. Copy the connection string. It looks like:
   ```
   mongodb+srv://USERNAME:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<db_password>` with the password from step 3. Keep this string private.

## 2. Deploy the app (Render)

1. Sign up at https://render.com using **Sign in with GitHub**.
2. **New** > **Blueprint**, then connect the `SFS` repository. Render reads
   [`render.yaml`](../render.yaml) from the repo.
3. Render asks for three values:
   - `MONGODB_URI`: the connection string from step 1.5
   - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: the same values as in `server/.env`
4. Click **Apply**. The first build takes 3 to 5 minutes. When it finishes, Render shows
   the site address, for example `https://sfs-abcd.onrender.com`.

`render.yaml` sets everything else: a random `JWT_SECRET`, MongoDB for the database and file
storage, a 25 MB upload limit, and development login turned off.

## 3. Allow GitHub login on the new address

1. Open https://github.com/settings/developers and select the **SFS** OAuth app.
2. Under **Redirect URIs**, click **Add redirect URI** and enter your Render address followed by
   `/api/auth/github/callback`, for example:
   ```
   https://sfs-abcd.onrender.com/api/auth/github/callback
   ```
   Keep the `localhost` entry so local development still works.
3. Optionally change **Homepage URL** to the Render address.
4. Save.

## 4. Check it

Open the Render address, sign in with GitHub, create a vault, upload a file and open
**Server view**. In MongoDB Atlas, **Browse Collections** shows the `sfs` database: `users`,
`files`, and `blobs.files` / `blobs.chunks` (the encrypted file contents). None of it is readable.

## Good to know

- **Cold starts.** Render's free tier stops the server after 15 minutes without visitors. The
  next visit takes about a minute to load. Open the site a minute before a demo.
- **Updates.** Every `git push` to `main` redeploys automatically.
- **Limits.** 512 MB total storage on Atlas, and 25 MB per file (change `MAX_FILE_MB` in Render's
  environment settings; Render's free server has 512 MB of memory, so keep it modest).
- **Inactivity.** Atlas may pause a free cluster after a long period with no use. Resume it from
  the Atlas dashboard.
- **Other storage.** To keep files in Backblaze B2, Cloudflare R2 or AWS S3 instead, set
  `STORAGE_DRIVER=s3` and the `AWS_*` variables (plus `S3_ENDPOINT` for B2 or R2). The database
  can stay on Atlas.
