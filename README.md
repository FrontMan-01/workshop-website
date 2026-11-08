# start.here

Free student workshop platform — gamified, level-based tech learning with live sessions, recordings, and competitions.

## Project Structure

```
workshop-website/
├── index.html              ← Student-facing portal (SPA with hash routing)
├── admin.html              ← Admin dashboard (role-gated: profiles.role = 'admin')
├── config.js               ← Supabase URL & anonymous public key
├── favicon.svg             ← Retro game controller SVG favicon
└── supabase-ready/
    ├── schema.sql          ← PostgreSQL schema, RLS policies, triggers, and starter Level 1
    ├── config.js           ← Template config for new projects
    └── README.md           ← Detailed Supabase setup and SMTP guidelines
```

## Quick Start

### 1. Configure Supabase Credentials
Ensure `config.js` contains your Supabase project URL and anonymous publishable key:

```javascript
window.APP_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_KEY: "your-anon-key"
};
```

### 2. Set Up the Database
In your Supabase project dashboard:
1. Open **SQL Editor** -> **New query**.
2. Paste the contents of `supabase-ready/schema.sql` and click **Run**.
3. Under **Authentication** -> **URL Configuration**, set the **Site URL** to your hosting domain (or `http://localhost:8000` for local development).

### 3. Run Locally
Because the application communicates with Supabase over HTTPS and handles OAuth / recovery hash redirects, serve it with any local static HTTP server:

```bash
# Using Python
python3 -m http.server 8000

# Or using Bun / Node
npx serve .
```

- Open `http://localhost:8000/` for the Student Portal.
- Open `http://localhost:8000/admin.html` for the Admin Dashboard.

### 4. Create Your Administrator Account
1. Open the Student Portal (`http://localhost:8000/#auth`) and register an account under **Create account**.
2. In the Supabase **SQL Editor**, promote your user to administrator:
   ```sql
   select public.set_user_role(
     (select id from auth.users where email = 'your-email@example.com'),
     'admin'
   );
   ```
   *(Alternatively: `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'your-email@example.com');`)*
3. Navigate to `admin.html` and sign in with your email and password (or magic link).

## Key Features & Security

- **Gamified Level Progression:** Workshops unlock progressively (Level 1, Level 2, ...). Students track completed sessions with real-time progress bars.
- **Row Level Security (RLS):**
  - Students can only view and update their own profiles, progress, and competition submissions.
  - Workshop live meeting links (`workshop_links`) and session recordings are strictly restricted to enrolled students.
  - Administrative endpoints, events telemetry, and student rosters are restricted to users with `role = 'admin'`.
- **Dynamic Competitions:** Form fields are stored as JSONB schemas so admins can customize project submission questions on the fly.
- **Zero-Build Architecture:** Pure HTML5, CSS3, and JavaScript — no build steps, node_modules, or bundlers required.

## Deployment

| File | Deploy to | Access Control |
|------|-----------|----------------|
| `index.html` | Public URL (GitHub Pages / Vercel / Netlify) | Public (All Students) |
| `admin.html` | Private / internal deployment or protected route | Administrators Only (`role = 'admin'`) |
