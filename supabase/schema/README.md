# Supabase database schema

This directory is the repository source of truth for the application database structure.
It mirrors the linked Supabase project as of 2026-08-26.

## Public tables (16)

| Table | Source file |
| --- | --- |
| `profiles` | `profiles.sql` |
| `exercises` | `exercises.sql` |
| `user_exercises` | `user-exercises.sql` |
| `programs` | `program-core.sql` + `catalog-program-adoption.sql` |
| `program_weeks` | `program-core.sql` |
| `program_workouts` | `program-core.sql` |
| `program_workout_exercises` | `program-core.sql` + `catalog-program-adoption.sql` |
| `program_exercise_sets` | `program-core.sql` |
| `user_programs` | `program-enrollment.sql` |
| `scheduled_workouts` | `program-enrollment.sql` |
| `scheduled_workout_exercises` | `program-enrollment.sql` + `catalog-program-adoption.sql` |
| `scheduled_sets` | `program-enrollment.sql` |
| `workout_sessions` | `workout-session.sql` |
| `workout_session_exercises` | `workout-session.sql` + `catalog-program-adoption.sql` |
| `performed_sets` | `workout-session.sql` |
| `catalog_programs` | `catalog-programs.sql` |

All 16 public tables have RLS enabled in the live project. `exercises` and published `catalog_programs` are read-only for authenticated users; user-owned tables use ownership policies. Program child tables inherit ownership through `programs.owner_id`; scheduled snapshot tables inherit ownership through `user_programs.user_id`; workout execution tables inherit ownership through `workout_sessions.user_id`.

## Other database objects

- `private.handle_new_user()` and the `auth.users` profile trigger: `profiles.sql`
- Atomic program create/update RPCs and private `program-covers` Storage bucket: `program-persistence.sql`
- `rest_days_after` schedule support and program update RPC: `program-schedule.sql`
- User enrollment and immutable scheduled-workout snapshot tables/RLS: `program-enrollment.sql`
- Snapshot source FK indexes: `program-enrollment-indexes.sql`
- Server-side start-date guard: `program-enrollment-date-guard.sql`
- Final schedule modes (`custom`, `weekly_mwf`, `weekly_tts`, `cycle_2_2`) and schedule-aware start RPC: `program-schedule-modes.sql`
- Future schedule resync after editing a joined program: `program-reschedule-on-edit.sql`
- Editable joined-program start date before workout execution begins: `program-start-date-edit.sql`
- Actual workout execution snapshot, one-active-session rule and `start_workout` / `complete_workout` RPCs: `workout-session.sql`
- Reordering exercises inside an active workout session without changing the source program: `workout-session-editing.sql`
- Abandoned workout lifecycle and skipped-workout restart guard: `workout-session-abandon.sql`
- Shared published catalog of ready-made program payloads imported from structured source files: `catalog-programs.sql`
- Conversion of a catalog program into a user-owned Program plus exercise-name/prescription snapshot propagation: `catalog-program-adoption.sql`
- Covering index for the catalog source foreign key on user-owned programs: `catalog-program-adoption-index.sql`

### Catalog behavior

`catalog_programs` is separate from user-owned `programs`:

- catalog rows are shared content and are not owned or edited by app users;
- authenticated users can read only rows with `published = true`;
- `anon` has no table access;
- the structured source is kept in `source_payload` so original workout and exercise prescriptions are not lost during import;
- user-created and joined programs remain isolated in the existing `programs` / `user_programs` lifecycle.

Joining a catalog program uses `adopt_catalog_program(uuid)` before the normal Step 3/start flow:

- the catalog row is copied into a normal user-owned `programs` template;
- `programs.source_catalog_program_id` records where the copy came from;
- adoption is idempotent for one user/catalog pair, so repeated taps do not create duplicate user templates;
- a source exercise is linked to `exercises.id` only when its name matches the canonical catalog exactly;
- unmatched or compound source exercises keep `exercise_id = null` and preserve `exercise_name_snapshot` plus `prescription_snapshot`;
- those snapshot fields propagate through `program_workout_exercises` → `scheduled_workout_exercises` → `workout_session_exercises`, so the program stays executable even before all legacy names are mapped to the canonical exercise catalog;
- the old `(workout_id, exercise_id)` uniqueness constraint is intentionally removed because the imported catalog contains workouts where the same exercise can occur more than once; position remains unique;
- common textual prescriptions are converted to planned sets when they can be parsed safely, while the original prescription text is always retained.

### Schedule edit behavior

Editing a program remains a template edit, but if the owner already has that program in `active` or `paused` state, the calendar is synchronized with the new rhythm:

- workouts before `current_date` remain unchanged;
- `completed` and `skipped` workouts remain unchanged;
- only upcoming rows with status `scheduled` are moved;
- if the program has not started yet, `user_programs.start_date` is synchronized with the newly calculated first workout;
- snapshot exercise/set content remains unchanged; the resync changes dates only.

### Start-date edit behavior

A joined program can change its first-workout date while it has not actually started:

- the new date cannot be in the past;
- weekly modes still require a valid weekday (`Пн/Ср/Пт` or `Вт/Чт/Сб`);
- all `scheduled_workouts` dates are recalculated from the new date using the current schedule mode;
- `user_programs.start_date` is updated at the same time;
- exercise/set snapshots are not recreated;
- once any `workout_session` exists, the original start date becomes history and can no longer be rewritten.

### Workout execution behavior

`ScheduledWorkout` is the user's plan. Pressing “Начать тренировку” creates a separate `WorkoutSession` snapshot:

- one user can have only one `active` workout session at a time;
- restarting the same active scheduled workout is idempotent and returns the existing session;
- exercises and planned sets are copied into `workout_session_exercises` and `performed_sets`;
- performed sets store warm-up/working type, planned reps, actual weight/reps and completion state;
- a user can add/delete sets, replace an exercise, or reorder exercises inside the current active session without modifying the source program;
- previous exercise results are read from completed workout-session history regardless of program;
- snapshot-only catalog exercises are grouped by their preserved exercise name until a canonical `exercise_id` is assigned;
- best set uses completed working sets only; warm-up sets stay visible in history but are excluded from best-set and tonnage calculations;
- completing a session sets both `workout_sessions.status` and the linked `scheduled_workouts.status` to `completed`;
- abandoning a session sets `workout_sessions.status = abandoned` and the linked `scheduled_workouts.status = skipped`;
- abandoned session sets remain stored but are excluded from completed history, previous-result comparisons and personal records;
- a skipped/cancelled scheduled workout cannot be started again;
- when no scheduled workouts remain, the corresponding `user_programs` row is completed automatically, including when the last remaining workout is skipped;
- the workout timer is derived from server `started_at`, so page reloads do not reset workout duration.

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
12. `workout-session.sql`
13. `program-start-date-edit.sql`
14. `workout-session-editing.sql`
15. `workout-session-abandon.sql`
16. `catalog-programs.sql`
17. `catalog-program-adoption.sql`
18. `catalog-program-adoption-index.sql`
19. `verify-schema.sql` (verification only; it does not create objects)

`program-core.sql` already contains the current `rest_days_after` and `schedule_mode` columns. The later schedule/catalog files are still required because they contain the current RPC definitions, snapshot extensions and supporting indexes that bring a fresh database to the same final behavior as production.

## Verification

Run `verify-schema.sql` after provisioning. It checks:

- all 16 required public tables exist;
- RLS is enabled on every required public table;
- the expected RLS policy counts are present;
- `anon` has no table privileges on application tables;
- all nine current program/workout/catalog RPCs have the expected `SECURITY INVOKER` mode;
- the catalog-adoption snapshot columns exist in the template, schedule and workout-session layers;
- `authenticated` can execute `adopt_catalog_program(uuid)` while `anon` cannot;
- the `programs.source_catalog_program_id` foreign key has its covering index;
- the private `program-covers` bucket exists with the correct 5 MB/MIME restrictions;
- all four owner-only Storage policies exist.

For a full local restore test, use the Supabase CLI and rebuild a disposable local database from the repository schema/migrations.

## Rule for future DB changes

A database change is not complete until both are true:

1. it is applied and tested in Supabase; and
2. the corresponding SQL in this directory is updated in the same development cycle.

Do not create application tables or RLS policies only in the Supabase Dashboard without committing their SQL definition here.
