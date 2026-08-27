# Supabase database schema

This directory is the repository source of truth for the application database structure.
It mirrors the linked Supabase project as of 2026-08-27.

## Public tables (16)

| Table | Source file |
| --- | --- |
| `profiles` | `profiles.sql` |
| `exercises` | `exercises.sql` |
| `user_exercises` | `user-exercises.sql` |
| `programs` | `program-core.sql` + `catalog-program-adoption.sql` + `program-cycle-model.sql` |
| `program_weeks` | `program-core.sql` |
| `program_workouts` | `program-core.sql` |
| `program_workout_exercises` | `program-core.sql` + `catalog-program-adoption.sql` + `program-cycle-model.sql` |
| `program_exercise_sets` | `program-core.sql` |
| `user_programs` | `program-enrollment.sql` |
| `scheduled_workouts` | `program-enrollment.sql` + `program-cycle-model.sql` |
| `scheduled_workout_exercises` | `program-enrollment.sql` + `catalog-program-adoption.sql` |
| `scheduled_sets` | `program-enrollment.sql` |
| `workout_sessions` | `workout-session.sql` |
| `workout_session_exercises` | `workout-session.sql` + `catalog-program-adoption.sql` |
| `performed_sets` | `workout-session.sql` |
| `catalog_programs` | `catalog-programs.sql` + `catalog-program-cycle-normalization.sql` |

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
- Catalog normalization to one sequential workout cycle plus reliable equipment extraction: `catalog-program-cycle-normalization.sql`
- New program structure (`legacy_weeks` / `cycle`), repeat count and cycle numbering: `program-cycle-model.sql`
- Cycle-aware create/update/start/date-reschedule RPCs: `program-cycle-schedule.sql`
- Final normalized-catalog → cycle-program adoption RPC: `program-cycle-catalog-adoption.sql`
- Database guard that freezes cycle shape for `active` / `paused` participations: `program-cycle-edit-guard.sql`

## Repeated-cycle program model

The user-facing model for new programs is no longer “choose a number of weeks first”. A new program is:

`Program → one template cycle → workouts → exercises → sets`

The user then chooses:

1. the rhythm between workouts (`custom`, fixed weekdays, or `2 training / 2 rest`);
2. `cycle_repeat_count` — how many times to repeat the full cycle;
3. the date of the first workout when joining.

Important behavior:

- `programs.structure_mode = 'cycle'` means the template contains exactly one `program_weeks` row used as a compatibility container for the cycle;
- `programs.cycle_repeat_count` is 1–52;
- `programs.week_count` remains for backward compatibility and is always `1` for cycle programs;
- enrollment expands the template into `workouts_in_cycle × cycle_repeat_count` immutable `scheduled_workouts` rows;
- `scheduled_workouts.cycle_number` stores the 1-based repetition number for cycle programs and remains null for legacy schedules;
- `rest_days_after` on the last workout of a custom cycle is the bridge to the first workout of the next repetition;
- fixed weekday rhythms continue across cycle boundaries rather than resetting each cycle;
- the `cycle_2_2` rhythm also continues across cycle boundaries as one continuous pattern;
- existing week-based rows stay `legacy_weeks` and remain executable; UI may label their groups as legacy “stages” rather than presenting weeks as the current product model.

The “one cycle ≈ one week” idea is only an informational recommendation in the UI. The database does not require a cycle to equal seven days.

### Editing a joined cycle program

Rhythm and cycle size are intentionally treated differently:

- the owner may edit the rhythm and custom `rest_days_after`; only future `scheduled` dates are recalculated;
- workouts before `current_date`, `completed` workouts and `skipped` workouts remain unchanged;
- exercise/set snapshot content remains unchanged;
- if the program has not started, `user_programs.start_date` follows the recalculated first workout;
- `structure_mode` and `cycle_repeat_count` cannot change while the owner's participation is `active` or `paused`;
- the restriction exists both in the UI and as the `programs_guard_active_cycle_configuration` database trigger, so a direct Data API update cannot resize an already materialized schedule;
- after the participation is no longer live, a template can be edited for a future run.

## Catalog behavior

`catalog_programs` is separate from user-owned `programs`:

- catalog rows are shared content and are not owned or edited by app users;
- authenticated users can read only rows with `published = true`;
- `anon` has no table access;
- the structured source is kept in `source_payload` so original workout and exercise prescriptions are not lost during import;
- all published catalog rows are normalized to `source_payload.cycle.workouts` in source order;
- original source week count is retained as `source_payload.source_week_count` for traceability, while compatibility `week_count` is set to `1`;
- `equipment` is filled only when it can be recovered reliably from the original description; missing level/description/equipment remain null and the UI shows “Нет данных” rather than inventing values;
- user-created and joined programs remain isolated in the existing `programs` / `user_programs` lifecycle.

Joining a catalog program uses `adopt_catalog_program(uuid)` before the normal Step 3/start flow:

- the catalog row is copied into a normal user-owned `programs` template with `structure_mode = 'cycle'` and initial `cycle_repeat_count = 1`;
- the user then chooses rhythm and repeat count before joining;
- `programs.source_catalog_program_id` records where the copy came from;
- adoption is idempotent for one user/catalog pair, so repeated taps do not create duplicate user templates;
- a source exercise is linked to `exercises.id` only when its name matches the canonical catalog exactly;
- unmatched or compound source exercises keep `exercise_id = null` and preserve `exercise_name_snapshot` plus `prescription_snapshot`;
- those snapshot fields propagate through `program_workout_exercises` → `scheduled_workout_exercises` → `workout_session_exercises`, so the program stays executable even before all legacy names are mapped to the canonical exercise catalog;
- the old `(workout_id, exercise_id)` uniqueness constraint is intentionally removed because the imported catalog contains workouts where the same exercise can occur more than once; position remains unique;
- common textual prescriptions are converted to planned sets when they can be parsed safely, while the original prescription text is always retained.

## Start-date edit behavior

A joined program can change its first-workout date while it has not actually started:

- the new date cannot be in the past;
- weekly modes still require a valid weekday (`Пн/Ср/Пт` or `Вт/Чт/Сб`);
- all `scheduled_workouts` dates are recalculated from the new date using the current schedule mode;
- custom cycle programs wrap their template index between repetitions when calculating `rest_days_after`;
- `user_programs.start_date` is updated at the same time;
- exercise/set snapshots are not recreated;
- once any `workout_session` exists, the original start date becomes history and can no longer be rewritten.

## Workout execution behavior

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
19. `catalog-program-cycle-normalization.sql`
20. `program-cycle-model.sql`
21. `program-cycle-schedule.sql`
22. `program-cycle-catalog-adoption.sql`
23. `program-cycle-edit-guard.sql`
24. `verify-schema.sql` (verification only; it does not create objects)

`program-core.sql` still contains the original compatibility columns and historical milestones. The later schedule/catalog/cycle files intentionally override affected function definitions so a fresh database reaches the same final behavior as production.

## Verification

Run `verify-schema.sql` after provisioning. It checks:

- all 16 required public tables exist;
- RLS is enabled on every required public table;
- exactly 57 application RLS policies are present;
- `anon` has no application-table grants;
- all 11 current program/workout/catalog RPCs are `SECURITY INVOKER`, executable by `authenticated` and not by `anon`;
- the catalog-adoption snapshot columns exist in the template, schedule and workout-session layers;
- the four cycle/catalog columns and three cycle constraints exist;
- the active-cycle configuration guard function and trigger exist;
- every published catalog row is normalized to one non-empty cycle;
- the `programs.source_catalog_program_id` foreign key has its covering index;
- the private `program-covers` bucket exists with the correct 5 MB/MIME restrictions;
- all four owner-only Storage policies exist.

For a full local restore test, use the Supabase CLI and rebuild a disposable local database from the repository schema/migrations. The current execution environment does not have the Supabase CLI or `psql`, so production verification is performed through the connected project plus transaction/rollback smoke tests.

## Rule for future DB changes

A database change is not complete until both are true:

1. it is applied and tested in Supabase; and
2. the corresponding SQL in this directory is updated in the same development cycle.

Do not create application tables, functions, triggers or RLS policies only in the Supabase Dashboard without committing their SQL definition here.
