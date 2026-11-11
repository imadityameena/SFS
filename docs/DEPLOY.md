# Deploying SFS online (free)

SFS runs online on three free services. None of them needs a credit card.

| Service | What it stores or does | Free tier |
|---|---|---|
| **Backblaze B2** | The encrypted files | 10 GB |
| **MongoDB Atlas** | User records, encrypted keys and file records (small) | 512 MB |
| **Render** | Runs one server that hosts the website and the API, with HTTPS | 750 hours a month |

A database is still needed besides B2: Render's free server wipes its own disk on every
restart, and the database holds each user's encrypted private key.

The server only ever receives encrypted data, so moving to the cloud does not change the
zero-knowledge design. B2 and Atlas hold the same ciphertext that `server/data/` holds locally.

## 1. Create the file bucket (Backblaze B2)

1. Sign up for **B2 Cloud Storage** at https://www.backblaze.com/sign-up/cloud-storage.
   Choose the **EU Central** region. It is set once for the whole account and cannot be
   changed later. Render and Atlas also run in Frankfurt, so all three are close together.
2. **Buckets** > **Create a Bucket**:
   - Bucket name: something unique, for example `sfs-files-yourname`
   - Files in bucket: **Private**
   - Default encryption: Enable (optional, extra layer at rest)
   - Object lock: Disable
3. On the new bucket, note the **Endpoint**, for example `s3.eu-central-003.backblazeb2.com`.
   The part after `s3.` and before `.backblazeb2.com` is the region (`eu-central-003`).
4. Click the bucket's **Lifecycle Settings** and choose **Keep only the last version of the
   file**. Without this, B2 keeps a hidden copy of every deleted file and it still uses space.
5. **Application Keys** > **Add a New Application Key**:
   - Name: `sfs-server`
   - Allow access to bucket: only the bucket from step 2
   - Type of access: **Read and Write**

   Copy the **keyID** and **applicationKey**. B2 shows the application key only once.

These become five settings:

| Setting | Value |
|---|---|
| `S3_ENDPOINT` | `https://` + the endpoint, e.g. `https://s3.eu-central-003.backblazeb2.com` |
| `AWS_REGION` | the region, e.g. `eu-central-003` |
| `AWS_S3_BUCKET` | the bucket name |
| `AWS_ACCESS_KEY_ID` | the keyID |
| `AWS_SECRET_ACCESS_KEY` | the applicationKey |

### Optional: test B2 from your laptop first

Add the five settings and `STORAGE_DRIVER=s3` to `server/.env`, restart the server and upload a
file. It appears in the B2 bucket under `users/<user-id>/` as unreadable ciphertext. Files
uploaded earlier in local mode stay on disk and will not download while `STORAGE_DRIVER=s3`;
switch back to `local` afterwards if you want them.

## 2. Create the database (MongoDB Atlas)

1. Sign up at https://www.mongodb.com/cloud/atlas/register.
2. Create a cluster and choose the **M0 Free** tier on **AWS**, region **Frankfurt
   (`eu-central-1`)**, next to Render and B2.
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
   Replace `<db_password>` with the password from step 3. This is `MONGODB_URI`. Keep it private.

## 3. Deploy the app (Render)

1. Sign up at https://render.com using **Sign in with GitHub**.
2. **New** > **Blueprint**, then connect the `SFS` repository. Render reads
   [`render.yaml`](../render.yaml) from the repo.
3. Render asks for these values:
   - `MONGODB_URI`: from step 2
   - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`: the same values as in `server/.env`
   - `S3_ENDPOINT`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`:
     from step 1
4. Click **Apply**. The first build takes 3 to 5 minutes. When it finishes, Render shows the
   site address, for example `https://sfs-abcd.onrender.com`.

`render.yaml` sets everything else: a random `JWT_SECRET`, MongoDB for the database, B2 (S3) for
files, a 25 MB upload limit, and development login turned off.

## 4. Allow GitHub login on the new address

1. Open https://github.com/settings/developers and select the **SFS** OAuth app.
2. Under **Redirect URIs**, click **Add redirect URI** and enter your Render address followed by
   `/api/auth/github/callback`, for example:
   ```
   https://sfs-abcd.onrender.com/api/auth/github/callback
   ```
   Keep the `localhost` entry so local development still works.
3. Optionally change **Homepage URL** to the Render address.
4. Save.

## 5. Check it

Open the Render address, sign in with GitHub, create a vault, upload a file and open
**Server view**. Then look at the raw data:

- **B2:** Browse Files in the bucket shows `users/<user-id>/<random-id>.bin`. Download one; it is
  unreadable.
- **Atlas:** Browse Collections shows the `sfs` database with `users` and `files`. File names
  and keys are all encrypted.

## Good to know

- **Cold starts.** Render's free tier stops the server after 15 minutes without visitors. The
  next visit takes about a minute to load. Open the site a minute before a demo.
- **Updates.** Every `git push` to `main` redeploys automatically.
- **Limits.** 10 GB of files on B2 and 25 MB per file (change `MAX_FILE_MB` in Render's
  environment settings; Render's free server has 512 MB of memory, so keep it modest). B2's free
  downloads are generous for a demo.
- **Inactivity.** Atlas may pause a free cluster after a long period with no use. Resume it from
  the Atlas dashboard.
- **No B2?** Set `STORAGE_DRIVER=mongo` in Render to keep the encrypted files in Atlas instead
  (GridFS, within the 512 MB limit), and leave the five B2 settings empty.
