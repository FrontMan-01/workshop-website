# start.here app

Static site (HTML + JS) that talks to Supabase. No server of your own to run.

## Setup, in order

1. **Create a Supabase project** (free plan is fine to start).
2. **Run `schema.sql`**: Supabase dashboard > SQL Editor > paste > Run.
3. **Auth settings** (Authentication section of the dashboard):
   - Keep the Email provider on.
   - Set the Site URL to the address where you will host the site.
   - For the email-code login ("Forgot password" tab), edit the email template so it contains `{{ .Token }}`. Without it, students get a link instead of a code.
   - While testing, you can turn off "confirm email" so sign-ups do not wait for an email.
4. **Custom SMTP before real students use it.** The built-in email service only reaches your own team's addresses and is limited to a couple of emails per hour, so codes, resets and confirmations will fail for students. Add a custom SMTP provider in the Auth settings.
5. **Fill in `config.js`** with your project URL and publishable key (Project Settings > API). Never use the `service_role` key.
6. **Run it**: in this folder run `python3 -m http.server 8000` and open http://localhost:8000. To publish, upload the folder to any static host (Vercel, Netlify, Cloudflare Pages or GitHub Pages) and check their current free limits.
7. **Become the admin**: create your account on the Create account tab, then run this once in the SQL Editor:
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR-EMAIL');`
   Choose your own strong password when you sign up. You can change it any time on the Account page.
8. **Optional Google sign-in**: enable the Google provider in Supabase (needs a Google Cloud OAuth client).

## Notes

- Level locks are part of the game feel. They are enforced in the page, not the database. What the database does enforce: students see only their own progress, enrollments and submissions, and only enrolled students can read the live link, sessions and recordings.
- The email code may be 6 or 8 digits depending on your project; the form accepts either.
- Recording links are plain YouTube links. An enrolled student can share one.
- The admin dashboard screens come in the next step. The Admin link already appears for admin accounts.
