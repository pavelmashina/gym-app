# Supabase database schema

This directory is the repository source of truth for the application database structure.
It mirrors the linked Supabase project as of 2026-09-01.

## Public tables (16)

| Table | Main source files |
| --- | --- |
| `profiles` | `profiles.sql` |
| `exercises` | `exercises.sql` |
| `user_exercises` | `user-exercises.sql` |
| `programs` | `program-core.sql` + cycle/catalog milestone files |
| `program_weeks` | `program-core.sql` |
| `program_workouts` | `program-core.sql` |
| `program_workout_exercises` | `program-core.sql` + catalog/cycle milestone files |
| `program_exercise_sets` | `program-core.sql` |
| `user_programs` | `program-enrollment.sql` + `program-participation-controls.sql` |
| `scheduled_workouts` | `program-enrollment.sql` + cycle/participation milestone files |
| `scheduled_workout_exercises` | `program-enrollment.sql` + catalog adoption |
| `scheduled_sets` | `program-enrollment.sql` |
| `workout_sessions` | `workout-session.sql` |
| `workout_session_exercises` | `workout-session.sql` + catalog adoption |
| `performed_sets` | `workout-session.sql` |
| `catalog_programs` | `catalog-programs.sql` + `catalog-program-cycle-normalization.sql` |

All 16 public application tables have RLS enabled. Authenticated users only see data allowed by ownership policies; `anon` has no application-table grants.

## Core architecture

The application keeps three layers separate:

1. reusable program template: `Program → ProgramWeek compatibility container → ProgramWorkout → WorkoutExerciseTemplate → PrescribedSet`;
2. joined-program schedule snapshot: `UserProgram → ScheduledWorkout → ScheduledWorkoutExercise → ScheduledSet`;
3. actual execution snapshot: `WorkoutSession → WorkoutSessionExercise → PerformedSet`.

Template edits must not rewrite already materialized exercise/set snapshots or completed workout history.

## Repeating-cycle model

New programs use `programs.structure_mode = 'cycle'` and contain one template cycle. `programs.week_count` remains `1` only for backward compatibility. `programs.cycle_repeat_count` is 1–52.

Joining a cycle program expands it into `workouts_in_cycle × cycle_repeat_count` immutable `scheduled_workouts`. `scheduled_workouts.cycle_number` stores the 1-based repetition number. Legacy week-based programs remain executable with `structure_mode = 'legacy_weeks'`.

Supported schedule modes are:

- `custom` — each workout owns `rest_days_after`; the last workout's rest value bridges to the next cycle;
- `weekly_mwf` — Monday / Wednesday / Friday;
- `weekly_tts` — Tuesday / Thursday / Saturday;
- `cycle_2_2` — two training days followed by two full rest days.

Rhythm continues across cycle boundaries rather than resetting at the beginning of every repetition.

While a participation is `active` or `paused`, `structure_mode` and `cycle_repeat_count` are frozen by the `programs_guard_active_cycle_configuration` trigger. Rhythm/date edits may only recalculate future scheduled dates; completed/skipped history and exercise/set snapshots remain unchanged.

## Program participation lifecycle

`program-participation-controls.sql` adds three authenticated `SECURITY INVOKER` RPCs:

- `pause_program(uuid)` — changes an `active` participation to `paused` and records `paused_at`; scheduled snapshot rows and workout history are not deleted or recreated;
- `resume_program(uuid, date)` — changes a `paused` participation back to `active`, uses the chosen date as the next scheduled workout and recalculates only remaining `scheduled` dates according to the current schedule mode;
- `complete_program(uuid)` — manually completes an active/paused participation and changes only remaining `scheduled` workouts to `cancelled`; completed/skipped history is preserved.

A program cannot be paused or manually completed while one of its `WorkoutSession` rows is still `active`. The user must first complete or abandon the current workout.

Paused programs stay visible in the user's program list/detail screen but their scheduled workouts are intentionally excluded from the Home calendar. Resuming makes the recalculated remaining schedule visible again.

## Start date and joined-program schedule editing

Before workout execution begins, `change_program_start_date(uuid, date)` can change the first workout date and recalculate the schedule while preserving snapshots. Once workout history exists, the original start date is treated as history.

Editing rhythm for a joined program recalculates only future scheduled dates. Past dates, completed workouts and skipped workouts stay fixed.

## Workout execution

Starting a scheduled workout creates a separate WorkoutSession snapshot. Only one active session is allowed per user. The session supports warm-up/working sets, weight/reps, notes, previous results, best set, exercise replacement/reordering and abandonment.

Completing a workout marks the session and scheduled workout `completed`. Abandoning marks the session `abandoned` and the scheduled workout `skipped`. Skipped/cancelled workouts cannot be started again. When no scheduled workouts remain, the corresponding participation is completed automatically.

## Catalog programs

`catalog_programs` is shared published content separate from user-owned programs. Published rows are normalized to one ordered cycle in `source_payload.cycle.workouts`. `adopt_catalog_program(uuid)` copies a catalog program into a normal user-owned cycle template while preserving exercise-name and prescription snapshots when no canonical exercise match exists.

## Other important source files

- `program-persistence.sql` — atomic program create/update plus private `program-covers` Storage bucket;
- `program-schedule.sql`, `program-schedule-modes.sql`, `program-reschedule-on-edit.sql` — schedule calculation milestones;
- `program-start-date-edit.sql` — joined-program start-date edit;
- `workout-session.sql`, `workout-session-editing.sql`, `workout-session-abandon.sql` — actual workout lifecycle;
- `catalog-program-adoption.sql`, `catalog-program-cycle-normalization.sql` — ready-made program catalog;
- `program-cycle-model.sql`, `program-cycle-schedule.sql`, `program-cycle-catalog-adoption.sql` — final cycle-aware program behavior;
- `program-cycle-edit-guard.sql` — freezes active/paused cycle size;
- `program-participation-controls.sql` — pause/resume/manual completion lifecycle;
- `verify-schema.sql` — read-only final inventory verification.

## Fresh-project apply order

Apply the readable schema milestones in this order:

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
24. `program-participation-controls.sql`
25. `verify-schema.sql` (verification only)

Later milestone files intentionally replace function definitions from earlier files so a fresh database reaches the same final behavior as production.

## Verification

`verify-schema.sql` checks:

- all 16 public application tables exist and have RLS enabled;
- exactly 57 application RLS policies exist;
- `anon` has no application-table grants;
- all 14 current app-facing program/workout/catalog RPCs are `SECURITY INVOKER`, executable by `authenticated` and not by `anon`;
- catalog snapshot/source columns, cycle columns and cycle constraints exist;
- the active-cycle guard function/trigger exist;
- published catalog rows are normalized to non-empty cycles;
- the catalog source FK covering index exists;
- the private `program-covers` bucket and all four owner-only Storage policies match the expected configuration.

Production changes should additionally be smoke-tested inside transactions with `ROLLBACK`, and Supabase Security/Performance Advisors should be checked after DDL.

## Rule for future database changes

A database change is complete only when both are true:

1. it is applied and tested in Supabase; and
2. its SQL source-of-truth is committed in this directory in the same development cycle.

Do not leave application tables, RPCs, triggers or RLS policies only in the Supabase Dashboard.
