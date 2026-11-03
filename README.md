# start.here

Free student workshop platform — level-based learning with live sessions, recordings, and competitions.

## Project structure

```
workshop website/
├── index.html              ← Student-facing site (open this in browser)
├── admin.html              ← Admin dashboard (separate login, deploy privately)
│
└── supabase-ready/         ← For DB integration later (teammate's work)
    ├── index.html           ← Supabase-connected version of the student site
    ├── config.js            ← Supabase URL + anon key (fill before use)
    ├── schema.sql           ← Run this in Supabase SQL Editor to create tables
    └── README.md            ← Full setup instructions for Supabase
```

## Quick start

1. **Student site:** Double-click `index.html` — works offline, no server needed.
2. **Admin dashboard:** Double-click `admin.html` — default login: `admin` / `StartHere@2026`.
3. **Change admin credentials** in Settings after first login.

## How it works (no database)

- Admin saves workshops, sessions, live links, competitions → **localStorage**
- Student site reads from the same localStorage → displays the content
- Student progress, enrollments, submissions → saved to localStorage
- Both pages auto-refresh when you switch tabs

## For the database teammate

Everything you need is in the `supabase-ready/` folder. See `supabase-ready/README.md` for full instructions:

1. Create a Supabase project
2. Run `schema.sql` in the SQL Editor
3. Fill in `config.js` with your project URL and anon key
4. Set the Site URL in Supabase Auth settings
5. Replace the root `index.html` with `supabase-ready/index.html` (and update it to match any UI changes made in the root version)

## Deployment

| File | Deploy to | Who accesses it |
|------|-----------|-----------------|
| `index.html` | Public URL (Vercel / Netlify / GitHub Pages) | Students |
| `admin.html` | Private / secret URL (separate deployment) | Only admin |
