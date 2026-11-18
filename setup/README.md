# ZamBright Academy — Owner setup

The website is hosted on Cloudflare Pages using GitHub branch main.
Its public homepage is index.html and its owner dashboard is at:
https://YOUR-CLOUDFLARE-PAGES-ADDRESS/admin.html

**The dashboard requires Supabase setup before upload and publish work.**
Do not advertise paid downloads until a verified payment gateway is connected.

## Step 1 — Create a free Supabase project

1. Open https://supabase.com/dashboard and sign in with your own account.
2. Select New project, name it zambright-academy, choose the Free plan and set a strong database password.
3. Wait for the project to become ready.
4. Open SQL Editor. Copy the entire contents of setup/zambright-supabase.sql, paste into a new query, and run it. Check for errors.
5. The script creates secure database tables, an admin membership table, and the private PDF bucket.

Supabase Free currently includes 1 GB of file storage and permits individual files
up to 50 MB. It is a starting point for a modest PDF library.
We can migrate larger PDF storage to Cloudflare R2 as the library grows.

## Step 2 — Create your owner account

1. Supabase > Authentication > Users > Add user.
2. Enter your email and a strong password. Never share the password.
3. Copy the User UID (UUID) shown for the new user. Run the following as a separate query
   in SQL Editor, inserting YOUR exact user UID:

   insert into public.zambright_admins(user_id)
   values ('PASTE-YOUR-USER-UUID');

4. Confirm the query inserted one row. Only members of this table can manage
   ZamBright data, and every database write is checked on the server.
5. Disable public email signups in Auth settings if you do not need visitor accounts yet.

## Step 3 — Connect the website (PUBLIC key only)

1. Supabase > Project Settings / API Keys (the label may vary).
2. Find the Project URL and publishable / anon public key.
3. Open site-config.js in GitHub, click Edit, and enter:

   window.ZAMBRIGHT_CONFIG = Object.freeze({
     supabaseUrl: "https://YOUR-PROJECT.supabase.co",
     supabasePublishableKey: "YOUR-PUBLISHABLE-OR-ANON-KEY",
     whatsapp: "260973731979"
   });

4. Commit to main. Cloudflare Pages should redeploy if automatic deployments are enabled.
5. Visit /admin.html, log in, and upload a small test PDF as Draft.

**NEVER place a Supabase secret/service_role key, personal password, database
password, or payment API token in the website files.** A publishable/anon key
is intentionally public and its permissions are constrained by Row Level Security.

## Owner workflow

- Papers: enter title, subject, grade/form, topic, year, paper number and file.
- Review: save as Draft/Review. Only select Published after four quality checks.
- Free: published visitors can obtain short-lived PDF links.
- Paid: show an enquiry button on WhatsApp only; no automated checkout yet.
- Articles: publish academy updates, educational articles and financial literacy.
- Affiliate links: add verified HTTPS URLs. Affiliate links disclose commissions.

The dashboard sign-in page is reachable by anyone who knows its URL, but
server-side rules prohibit non-admin accounts from uploading or editing.

## Mobile Money — next phase

Compare Zambian gateways offering MTN MoMo, Airtel Money and Zamtel, then
verify merchant onboarding, costs, settlement, refunds and webhook signatures.
The checkout and payment verification must run on a trusted server-side service.
Only unlock a paid PDF after payment is verified by the server. A browser
"success" message by itself is not proof of payment.

Cloudflare Pages is separate from Render. No Render app needs to be deleted.
Back up original PDFs and database records periodically.
