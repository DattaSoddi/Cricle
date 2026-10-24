# Email sign-up verification setup

The browser app is static, so email OTPs are sent and verified by the Supabase Edge Function. Resend delivers email messages. Phone numbers are required and saved with the account, but are not verified. The browser only contains the Supabase project URL and public anon key; never put provider credentials or the service-role key in `supabase-config.js`.

## 1. Create the Supabase project

Create a project at [Supabase](https://supabase.com/) and copy its project URL and anon/public key into `supabase-config.js`:

```js
window.CIRCLE_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY",
};
```

These values identify the project and are intended for browser use. Keep all service-role and provider secrets in Supabase Function Secrets. The sign-up phone field provides a searchable country picker and saves the selected country calling code with the number in E.164 format. Email is optional; when provided, it must be verified before account creation.

## 2. Configure delivery providers

- Configure a Resend account and verify the domain used in the sender email. Email verification is sent only when the user enters an email address.
- To enable the Google buttons, create a Google OAuth client for a web application and configure its client ID and secret in Supabase **Authentication → Sign In / Providers → Google**. Add your website origin (for example, `http://localhost:8000`) to the Google client's authorized JavaScript origins, and add the Supabase Auth callback URL shown on the Google provider page to the Google client's authorized redirect URIs.
- Add the app's full local development URL (for example, `http://localhost:8000/index.html`) and production URL to Supabase **Authentication → URL Configuration → Redirect URLs**. Run the website on localhost or HTTPS; Google sign-in cannot return to a `file://` page.

In Supabase **Project Settings → Edge Functions → Secrets**, set:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (for example, `Circle <verify@your-verified-domain.com>`)
- `OTP_PEPPER` (a long random value generated privately; do not reuse any provider key)

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. Never expose the service-role key.

## 3. Apply the database migration and deploy

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), sign in, and link this folder to your project. Then run these commands from the project folder:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy signup-otp
```

For an existing project, `supabase db push` applies the email-only verification migration, and deploying the function updates it to send and verify email codes without sending SMS messages.

The function is public so it can be called before account sign-in. It limits requests by phone, email, and source IP, expires codes after 10 minutes, stores only keyed hashes of the codes and contact identifiers, and allows at most five verification attempts per code. The new migration allows the OTP challenge to omit a phone code; phone numbers are not sent to an SMS provider.

## 4. Host the website

Serve `index.html`, `app.js`, `styles.css`, and `supabase-config.js` from localhost during development or from an HTTPS web host. Do not use `file://` for the live flow. Set the website origin in Supabase Auth URL configuration if you later add Supabase Auth redirects.

The current social app still stores its account record in this browser's local storage. Supabase is used here for real email OTP delivery and server-side code verification; this does not turn the demo's account storage into a production user database.
Google sign-in authenticates through Supabase. New Google users choose a Circle username and provide the required phone number; their Google-verified email does not need a separate email code. The app's Circle profile still remains local to that browser.
