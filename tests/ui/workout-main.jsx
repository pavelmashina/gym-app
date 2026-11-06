import { Profiler, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkoutSessionScreen } from '../../src/components/WorkoutSessionScreen.jsx';
import { PullToRefresh } from '../../src/components/PullToRefresh.jsx';
import { useSwipeBackNavigation } from '../../src/lib/swipeBackNavigation.js';
// Same order as src/main.jsx: the cascade decides which scroll rules win.
import '../../src/styles.css';
import '../../src/workout-session-figma.css';
import '../../src/design-system.css';
import '../../src/design-system-audit.css';
import '../../src/bottom-navigation.css';
import '../../src/ui-layout-audit.css';

function Fixture() {
  useSwipeBackNavigation();
  return <>
    <Profiler id="workout" onRender={(_, phase, actual) => { (window.__workoutRenders ??= []).push({ phase, actual }); }}>
      <WorkoutSessionScreen scheduledWorkoutId="fixture-workout" onBack={() => location.reload()} onCompleted={() => location.reload()} onOpenWorkout={() => {}} />
    </Profiler>
    <PullToRefresh onRefresh={async () => {}} disabled />
  </>;
}

createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>);
