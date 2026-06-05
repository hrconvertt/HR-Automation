# Deploying Convertt HR to Vercel

## One-time setup (do this once)

### 1. Create the Vercel project
1. Go to https://vercel.com/convertt
2. Click **Add New… → Project**
3. Import `hrconvertt/HR-Automation` from GitHub
4. Framework preset: **Next.js** (auto-detected)
5. Root directory: leave as `./`
6. Build command: leave as default (Vercel will run `vercel-build` from package.json)
7. **Don't deploy yet** — add the database first.

### 2. Add Vercel Postgres
1. In the project, go to **Storage → Create Database → Postgres**
2. Name it `convertt-hr-prod`
3. Region: closest to your users (Pakistan → choose **Singapore** or **Frankfurt**)
4. Click **Create & Connect**
5. Vercel automatically injects `DATABASE_URL` into the project env vars ✓

### 3. Add the remaining env vars
In **Settings → Environment Variables**, add:

| Name | Value | Environments |
|---|---|---|
| `JWT_SECRET` | (generate one: `openssl rand -base64 48`) | All |
| `NEXT_PUBLIC_APP_URL` | `https://your-vercel-url.vercel.app` (update later if you add a custom domain) | All |

`DATABASE_URL` is already there from step 2.

### 4. Deploy
1. Back to the project, click **Deploy**
2. Vercel runs `prisma generate && prisma db push && next build`
3. ~3 minutes — done.

### 5. Seed the database (one-time, from your local machine)
After the first deploy:

```powershell
# Copy the prod DATABASE_URL from Vercel (Settings → Environment Variables → reveal)
$env:DATABASE_URL = "postgres://...the-vercel-postgres-url..."
$env:HR_ADMIN_EMAIL = "hr@convertt.co"
$env:HR_ADMIN_PASSWORD = "ChangeMe123!"
npm run seed:prod
```

That creates the HR admin user + 11 departments + leave policies + payroll config.

### 6. First sign-in
1. Open `https://your-vercel-url.vercel.app/login`
2. Sign in: `hr@convertt.co` / `ChangeMe123!`
3. Reset password on first login (forced by `mustChangePass=true`)

### 7. Import the master sheet (optional)
With `DATABASE_URL` still pointing at prod:

```powershell
node scripts/import-master-sheet.js
node scripts/import-master-extras.js
```

That loads all 28 employees + policies + positions + probation tracker rows from `Master Sheet - Convertt_HR (1).xlsx`.

---

## Ongoing — every code change

1. Make changes in this worktree
2. `git add -A && git commit -m "…" && git push`
3. Vercel auto-deploys the branch as a **Preview**
4. Open a PR → review the preview URL
5. Merge to `main` → auto-deploys to **Production**

`prisma db push` runs on every build, so schema changes flow through automatically.

---

## Custom domain
When you're ready to point `hr.convertt.co` at the deployment:
1. **Settings → Domains** in Vercel
2. Add `hr.convertt.co`
3. Vercel shows you the CNAME / A record to add at your domain registrar
4. Update `NEXT_PUBLIC_APP_URL` env var to `https://hr.convertt.co`
5. Trigger a redeploy (`Settings → Deployments → … → Redeploy`)
