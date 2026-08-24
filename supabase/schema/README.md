# Supabase schema source of truth

`profiles`, `exercises` and `user_exercises` existed in the production project before migration tracking was introduced. Their current DDL is captured in this directory as a recovery baseline.

All new production schema changes must be represented in `supabase/migrations/` and applied as a reviewed migration. Do not make untracked production DDL changes in the Dashboard.

Current application tables:

- `profiles` — one row per Supabase Auth user.
- `exercises` — system exercise catalog.
- `user_exercises` — exercises created by an individual user.
- `programs` — user-owned training programs.
- `program_weeks` — ordered weeks inside a program.
- `program_workouts` — ordered workouts inside a week.
- `program_workout_exercises` — ordered system exercises inside a workout.
- `program_exercise_sets` — prescribed sets/repetitions for an exercise.

Every table exposed through `public` must have RLS enabled and explicit grants/policies. User-owned rows are authorized via `auth.uid()`, never by email or phone.
