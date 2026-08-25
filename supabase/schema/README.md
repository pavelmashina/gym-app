# Supabase database schema

This directory is the repository source of truth for the application database structure.
It mirrors the linked Supabase project as of 2026-08-25.

## Public tables (12)

| Table | Source file |
| --- | --- |
| `profiles` | `profiles.sql` |
| `exercises` | `exercises.sql` |
| `user_exercises` | `user-exercises.sql` |
| `programs` | `program-core.sql` |
| `program_weeks` | `program-core.sql` |
| `program_workouts` | `program-core.sql` |
| `program_workout_exercises` | `program-core.sql` |
| `program_exercise_sets` | `program-core.sql` |
| `user_programs` | `program-enrollment.sql` |
| `scheduled_workouts` | `program-enrollment.sql` |
| `scheduled_workout_exercises` | `program-enrollment.sql` |
| `scheduled_sets` | `program-enrollment.sql` |

All 12 public tables have RLS enabled in the live project. `exercises` is read-only for authenticated users; user-owned tables use ownership policies. Program child tables inherit ownership through the parent `programs.owner_id`; scheduled snapshot tables inherit ownership through `user_programs.user_id`.

## Other database objects

- `private.handle_new_user()` and the `auth.users` profile trigger: `profiles.sql`
- Atomic program create/update RPCs and private `program-covers` Storage bucket: `program-persistence.sql`
- `rest_days_after` schedule support and program update RPC: `program-schedule.sql`
- User enrollment and immutable scheduled-workout snapshot tables/RLS: `program-enrollment.sql`
- Snapshot source FK indexes: `program-enrollment-indexes.sql`
- Server-side start-date guard: `program-enrollment-date-guard.sql`
- Final schedule modes (`custom`, `weekly_mwf`, `weekly_tts`, `cycle_2_2`) and schedule-aware start RPC: `program-schedule-modes.sql`
- Future schedule resync after editing a joined program: `program-reschedule-on-edit.sql`

### Schedule edit behavior

Editing a program remains a template edit, but if the owner already has that program in `active` or `paused` state, the calendar is synchronized with the new rhythm:

- workouts before `current_date` remain unchanged;
- `completed` and `skipped` workouts remain unchanged even if their status is changed manually;
- only upcoming rows with status `scheduled` are moved;
- if the program has not started yet, the future `user_programs.start_date` is synchronized with the newly calculated first workout;
- snapshot exercise/set content remains unchanged; the resync changes dates only.

This keeps workout history immutable while allowing the user to change the future cadence of an already joined program.

## Fresh-project apply order

The files are intentionally kept as readable schema milestones rather than one opaque dump. For a fresh Supabase project, apply them in this order:

1. `profiles.sql`
2. `exercises.sql`
3. `user-exercises.sql`
4. `program-core.sql`
5. `program-persistence.sql`
6. `program-schedule.sql`
7. `program-enrollment.sql`
8. `program-enrollment-indexes.sql`
9. `program-enrollment-date-guard.sql`
10. `program-schedule-modes.sql`
11. `program-reschedule-on-edit.sql`
12. `verify-schema.sql` (verification only; it does not create objects)

`program-core.sql` already contains the current `rest_days_after` and `schedule_mode` columns. The later schedule files are still required because they also contain the historical/current RPC definitions that bring a fresh database to the same final behavior as production.

## Verification

Run `verify-schema.sql` after provisioning. It checks:

- all 12 required public tables exist;
- RLS is enabled on every required public table;
- the expected RLS policy counts are present;
- `anon` has no table privileges on the application tables;
- the current program RPCs have the expected security mode;
- the private `program-covers` bucket exists with the correct 5 MB/MIME restrictions;
- all four owner-only Storage policies exist.

For a full local restore test, use the Supabase CLI and rebuild a disposable local database from the repository schema/migrations. Supabase's current documentation recommends `supabase db dump`/`db pull` for capturing remote schema and `supabase db reset` for testing rebuilds from source-controlled SQL.

## Rule for future DB changes

A database change is not complete until both are true:

1. it is applied and tested in Supabase; and
2. the corresponding SQL in this directory is updated in the same development cycle.

Do not create application tables or RLS policies only in the Supabase Dashboard without committing their SQL definition here.
