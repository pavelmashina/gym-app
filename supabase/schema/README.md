# Supabase database schema

This directory is the repository source of truth for the application database structure.
It mirrors the application-facing schema of the linked Supabase project as of 2026-09-09.

## Public tables (16)

| Table | Main source files |
| --- | --- |
| `profiles` | `profiles.sql` |
| `exercises` | `exercises.sql` |
| `user_recent_exercises` | `exercise-library-user-data.sql` |
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

All 16 application tables have RLS enabled. Authenticated users only see data allowed by ownership policies; `anon` has no application-table grants in the canonical bootstrap schema.

## Exercise library

`exercises` is the single exercise catalog used by the application:

- shared catalog rows have `owner_id is null`;
- user-created exercises have `owner_id = auth.uid()`;
- user exercises may contain `equipment`, `description`, `video_url` and private `video_path` metadata;
- authenticated users can read the shared catalog plus their own rows, while insert/update/delete are restricted to their own rows;
- deleting a user exercise removes the row and its media only when nothing references it. A referenced exercise gets `status = 'retired'`: it leaves the user's lists and pickers, while programs and workout history keep reading it by ID.

`user_recent_exercises` stores the last-used timestamp per `(user_id, exercise_id)` so the “Недавние упражнения” list is synchronized across devices for the same account.

`exercise-library-user-data.sql` also defines the private `exercise-videos` Storage bucket (100 MB, MP4/WEBM/MOV) and owner-folder Storage policies. Video object paths start with the current user's UUID.

## Core architecture

The application keeps three layers separate:

1. reusable program template: `Program → ProgramWeek compatibility container → ProgramWorkout → WorkoutExerciseTemplate → PrescribedSet`;
2. joined-program schedule snapshot: `UserProgram → ScheduledWorkout → ScheduledWorkoutExercise → ScheduledSet`;
3. actual execution snapshot: `WorkoutSession → WorkoutSessionExercise → PerformedSet`.

Saving a template rebuilds the joined-program snapshot of every workout that has not started yet (status `scheduled` and no WorkoutSession) in active or paused participations; see `../migrations/20261109145203_sync_not_started_workouts_with_program_edits.sql`. Completed, skipped and cancelled workouts, started workouts and every WorkoutSession snapshot are never rewritten.

## Repeating-cycle model

New programs use `programs.structure_mode = 'cycle'` and contain one template cycle. `programs.week_count` remains `1` only for backward compatibility. `programs.cycle_repeat_count` is 1–52.

Joining a cycle program expands it into `workouts_in_cycle × cycle_repeat_count` immutable `scheduled_workouts`. `scheduled_workouts.cycle_number` stores the 1-based repetition number. Legacy week-based programs remain executable with `structure_mode = 'legacy_weeks'`.

Supported schedule modes are:

- `custom` — each workout owns `rest_days_after`; the last workout's rest value bridges to the next cycle;
- `weekly_mwf` — Monday / Wednesday / Friday;
- `weekly_tts` — Tuesday / Thursday / Saturday;
- `cycle_2_2` — two training days followed by two full rest days.

Rhythm continues across cycle boundaries rather than resetting at the beginning of every repetition.

A ready-made program can also be joined on chosen ISO weekdays with `start_program_with_weekdays(uuid, date, int[])`. The program stays in `custom` mode, and the participation stores the days in `user_programs.training_weekdays`. While the program is in `custom` mode, saving the program, `resume_program`, `reschedule_scheduled_workout`, the `tail` scope of `reschedule_scheduled_workout_scoped` and `change_program_start_date` put the remaining workouts on the next chosen weekday instead of using `rest_days_after`; the date the user picks for the first moved workout is kept as is. Choosing a preset rhythm in the editor clears the chosen weekdays. See `../migrations/20261109170000_keep_chosen_training_weekdays.sql`.

While a participation is `active` or `paused`, `structure_mode` and `cycle_repeat_count` are frozen by the `programs_guard_active_cycle_configuration` trigger. Rhythm/date edits may only recalculate future scheduled dates. Exercise edits rebuild the not-started workouts by plan position (`mod(sequence_number - 1, workouts_in_cycle) + 1`); adding or removing a cycle workout grows or trims the not-started tail to `workouts_in_cycle × cycle_repeat_count`, and a participation with nothing left to do is completed. Completed/skipped history keeps its snapshots.

## Program participation lifecycle

`program-participation-controls.sql` adds three authenticated `SECURITY INVOKER` RPCs:

- `pause_program(uuid)` — changes an `active` participation to `paused` and records `paused_at`; scheduled snapshot rows and workout history are not deleted or recreated;
- `resume_program(uuid, date)` — changes a `paused` participation back to `active`, uses the chosen date as the next scheduled workout and recalculates only remaining `scheduled` dates according to the current schedule mode;
- `complete_program(uuid)` — manually completes an active/paused participation and changes only remaining `scheduled` workouts to `cancelled`; completed/skipped history is preserved.

A program cannot be paused or manually completed while one of its `WorkoutSession` rows is still `active`. The user must first complete or abandon the current workout.

Paused programs stay visible in the user's program list/detail screen but their scheduled workouts are intentionally excluded from the Home calendar. Resuming makes the recalculated remaining schedule visible again.

## Individual scheduled-workout controls

`scheduled-workout-controls.sql` adds two authenticated `SECURITY INVOKER` RPCs:

- `reschedule_scheduled_workout(uuid, date)` — moves one scheduled workout to today or a future date and recalculates only the remaining `scheduled` tail according to the program rhythm; snapshots and completed/skipped history are preserved;
- `skip_scheduled_workout(uuid)` — marks one not-yet-started workout as `skipped` without changing later dates and completes the participation automatically when no scheduled workouts remain.

Overdue workouts remain `scheduled` until the user explicitly reschedules or skips them. Neither action is allowed while the affected program has an active Workout Session.

## Start date and joined-program schedule editing

Before workout execution begins, `change_program_start_date(uuid, date)` can change the first workout date and recalculate the schedule while preserving snapshots. Once workout history exists, the original start date is treated as history.

Editing rhythm for a joined program recalculates only future scheduled dates. Past dates, completed workouts and skipped workouts stay fixed.

## Workout execution

Starting a scheduled workout creates a separate WorkoutSession snapshot. Only one active session is allowed per user. The session supports warm-up/working sets, weight/reps, notes, previous results, best set, exercise replacement, drag-and-drop reordering and abandonment.

`workout-session-reorder-scope.sql` provides the current authenticated `SECURITY INVOKER` reorder RPC. It can change only the current session or, when explicitly requested, the future scheduled copies of the same program workout. Since the 2026-11-09 migration the program-wide order is also stored in the template workout, so a later program edit keeps it. The old one-position move RPC is retired and dropped by this milestone.

The order of the sets inside one session exercise is `performed_sets.set_number`. `reorder_performed_sets(p_workout_session_exercise_id, p_ordered_set_ids)` (migration `20261109161041_reorder_performed_sets.sql`, authenticated, `SECURITY INVOKER`) rewrites every number of that exercise as 1..n in one transaction. It accepts only the owner's active session, every set of the exercise exactly once, and warm-up sets before working sets. Completed and abandoned sessions keep their order.

`add_session_exercise(p_session_id, p_exercise_id, p_scope default 'session')` (migrations `20261109190000_add_session_exercise.sql` and `20261109200000_add_exercise_to_program_from_workout.sql`, authenticated, `SECURITY INVOKER`) adds an exercise to the end of the owner's active, not paused session, from a program or standalone. The exercise must be visible in `exercise_catalog_v2` (published, or the user's own). It gets the catalog name as `exercise_name_snapshot` and one empty working set.

- `'session'`: only this session. No `source_scheduled_workout_exercise_id`; the program, its template and the scheduled copies do not change. A session that holds such an exercise can be reordered only within the session.
- `'program'`: the session's scheduled workout must come from a template workout of the user's own program. The exercise is appended to that template workout (`program_workout_exercises` plus one `program_exercise_sets` row without reps), to this workout's plan and to every workout of the user's active or paused participations made from the same template workout that has not started (status `scheduled`, no session). The session exercise and its set are linked to this workout's plan, so `reorder_workout_session_exercises(..., 'program')` still works.

The older `add_standalone_exercise` stays for cached app builds; the app no longer calls it. The two-argument `add_session_exercise` was replaced by the one with the scope, so a two-argument call is still valid and means `'session'`.

Completing a workout marks the session and scheduled workout `completed`. Abandoning marks the session `abandoned` and the scheduled workout `skipped`. Skipped/cancelled workouts cannot be started again. When no scheduled workouts remain, the corresponding participation is completed automatically.

## Catalog programs

`catalog_programs` is shared published content separate from user-owned programs. Published rows are normalized to one ordered cycle in `source_payload.cycle.workouts`. `adopt_catalog_program(uuid)` copies a catalog program into a normal user-owned cycle template while preserving exercise-name and prescription snapshots when no canonical exercise match exists.

## Other important source files

- `exercise-library-user-data.sql` — cross-device recent exercises plus private exercise-video Storage;
- `statistics-cross-device-sync.sql` — account-scoped measurements, photos and statistics favorites sync;
- `program-persistence.sql` — atomic program create/update plus private `program-covers` Storage bucket;
- `program-schedule.sql`, `program-schedule-modes.sql`, `program-reschedule-on-edit.sql` — schedule calculation milestones;
- `program-start-date-edit.sql` — joined-program start-date edit;
- `workout-session.sql`, `workout-session-abandon.sql`, `workout-session-reorder-scope.sql` — actual workout lifecycle and current reorder behavior;
- `catalog-program-adoption.sql`, `catalog-program-cycle-normalization.sql` — ready-made program catalog;
- `program-cycle-model.sql`, `program-cycle-schedule.sql`, `program-cycle-catalog-adoption.sql` — final cycle-aware program behavior;
- `program-cycle-edit-guard.sql` — freezes active/paused cycle size;
- `program-participation-controls.sql` — pause/resume/manual completion lifecycle;
- `scheduled-workout-controls.sql` — reschedule/skip controls and overdue-workout rules;
- `verify-schema.sql` — read-only final inventory verification.

## Fresh-project apply order

Apply the readable schema milestones in this order:

1. `profiles.sql`
2. `exercises.sql`
3. `exercise-library-user-data.sql`
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
14. `workout-session-abandon.sql`
15. `catalog-programs.sql`
16. `catalog-program-adoption.sql`
17. `catalog-program-adoption-index.sql`
18. `catalog-program-cycle-normalization.sql`
19. `program-cycle-model.sql`
20. `program-cycle-schedule.sql`
21. `program-cycle-catalog-adoption.sql`
22. `workout-session-reorder-scope.sql`
23. `program-cycle-edit-guard.sql`
24. `program-participation-controls.sql`
25. `scheduled-workout-controls.sql`
26. `statistics-cross-device-sync.sql`
27. `verify-schema.sql` (verification only)

Later milestone files intentionally replace function definitions from earlier files so a fresh database reaches the same final behavior as production.

## Verification

`verify-schema.sql` checks the current application-facing inventory, including RLS, restricted RPCs, cycle/catalog structures and both private Storage features (`program-covers` and `exercise-videos`).

Production changes should additionally be smoke-tested inside transactions with `ROLLBACK`, and Supabase Security/Performance Advisors should be checked after DDL.

## Rule for future database changes

A database change is complete only when both are true:

1. it is applied and tested in Supabase; and
2. its SQL source-of-truth is committed in this directory in the same development cycle.

Do not leave application tables, RPCs, triggers, Storage configuration or RLS policies only in the Supabase Dashboard.
