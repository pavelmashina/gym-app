-- Cover source foreign keys used by scheduled-workout snapshot maintenance.
create index if not exists scheduled_workouts_source_program_workout_idx
  on public.scheduled_workouts (source_program_workout_id);

create index if not exists scheduled_workout_exercises_source_idx
  on public.scheduled_workout_exercises (source_program_workout_exercise_id);
