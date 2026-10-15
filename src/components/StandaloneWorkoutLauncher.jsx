import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { startStandaloneWorkout } from '../lib/workoutSessions.js';
import '../standalone-workout.css';

export function StandaloneWorkoutLauncher({ onOpenWorkout }) {
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase.from('workout_sessions')
        .select('scheduled_workout_id, scheduled_workouts(standalone_owner_id)')
        .eq('status', 'active').limit(1);
      if (alive && !error) setActive(data?.[0] ?? null);
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { alive = false; window.removeEventListener('focus', refresh); };
  }, []);
  async function open() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const id = await startStandaloneWorkout();
      onOpenWorkout(id);
    } catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  }
  const standaloneActive = Boolean(active?.scheduled_workouts?.standalone_owner_id);
  return <div className="standalone-workout-launcher">
    <button className="standalone-workout-trigger" type="button" disabled={busy} onClick={open}>
      <span aria-hidden="true">+</span>
      <strong>Разовая тренировка</strong>
    </button>
    {active && !standaloneActive && <button type="button" className="standalone-current-workout" onClick={() => onOpenWorkout(active.scheduled_workout_id)}>Текущая тренировка</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
