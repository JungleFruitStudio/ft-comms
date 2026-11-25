# FT Comms

Foreign Tongues' people registry, with segments, email and (soon) texts in one place. Internal use only.
Lives at https://ft-comms.vercel.app. Pairs with Foreign Tongues Social, FT Events and FT Stopmotion: the same
sign-in, the same look.

- **Sign-in**: FTS's accounts (the same Supabase project). Who may come in is one database function,
  `ftc_allowed()` (today: every active FTS member). Only FTS admins can send marketing email or change Settings.
- **Database**: the `ftc_*` tables in Foreign Tongues' own Supabase project (`ctmvkumkqlspyenbnnkn`; from Claude,
  use the "FT Supabase" connector, never the Jungle Fruit one). Set up by the migration `ft_comms_setup`.
  - `ftc_people` (names, `emails[]`, `phones[]`, `tags[]`, marketing consent, `last_contact_at`), `ftc_orgs`,
    `ftc_timeline` (everything that happened with a person: notes, emails, texts, calls, meetings, orders; an order's full detail is in `meta`), `ftc_segments` (saved
    filters; `rules` is read by `js/model.js` `matches`), `ftc_emails` (drafts and sent), `ftc_settings` (sender),
    `ftc_private` (the unsubscribe secret; nobody can read it through the API).
  - `ftc_people.ext` keeps what came with a person from another system as it was exported (`ext.squarespace`).
  - Phone numbers are stored as `+` and digits (ten digits are taken as US), emails lowercased.
  - The hourly FT backup takes these tables too (`ftb_tables()` matches `ftc_`).
- **Email**: sent through Resend by `api/send.js` (env `RESEND_API_KEY` on this Vercel project; the from address
  must be on a domain verified in Resend). Marketing goes only to people with `email_ok` who haven't unsubscribed,
  carries an unsubscribe link (`api/unsub.js`, signed in the database by `ftc_sig`) and the postal address from
  Settings. Direct is a personal note to 25 people at most. Each send writes an `email_out` entry per person; a
  retry skips people who already have one for that email.
- **FT Events**: every guest and team member of an event is a person here, with the event on their timeline
  (`ftc_sync_event`, run by a trigger on `fte_events`; links in `ftc_event_links`, read through the view
  `ftc_event_people`). People are matched by email, then phone, then name; nothing in FT Events is changed. A segment
  can pick an event's guests or team (`rules.event`), and Email offers them directly under "To".
- **Texts**: not connected yet. The plan is a small helper on one Mac that copies conversations with people in the
  registry into `ftc_timeline` (`text_in` / `text_out`), matched by phone number. Until then texts are logged by hand.
- **Code**: plain JavaScript modules, no build step. `js/app.js` (sign-in, pages), `js/db.js` (database),
  `js/model.js` (rules with no page in them), `js/people.js`, `js/pages.js`, `js/email.js`, `js/importer.js`.
  Bump `js/build.js` with every release.
