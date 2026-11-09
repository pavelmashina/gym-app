import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CreateProgramScreen } from '../../src/components/CreateProgramScreen.jsx';
import { ExercisesScreen } from '../../src/components/ExercisesScreen.jsx';
import '../../src/styles.css';
import '../../src/training-icon-tabs.css';
import '../../src/training-icon-tabs-adjustments.css';
import '../../src/catalog-programs-polish.css';
import '../../src/design-system.css';
import '../../src/design-system-audit.css';
import '../../src/ui-layout-audit.css';
import '../../src/training-program-polish.css';
import '../../src/program-ui-refresh.css';
import '../../src/november-card-navigation-refinements.css';
function Fixture() {
  const [saved, setSaved] = useState(false);
  const params = new URLSearchParams(location.search);
  const screen = params.get('screen') || 'draft';
  const userId = params.get('user') || 'fixture-a';
  return <div style={{ width: '100%', maxWidth: 430 }}><nav style={{ fontSize: 11 }}><a href="?screen=draft">Конструктор</a> · <a href="?screen=your-programs">Личные</a> · <a href="?screen=completed">Пройденные</a> · <a href="?screen=recommendations">Рекомендации</a> · <a href="?screen=my-exercises">Мои упражнения</a> · <a href="?screen=draft&user=fixture-b">Другой аккаунт</a></nav>
    {saved ? <p role="status">Тестовая программа сохранена</p> : screen === 'draft'
      ? <CreateProgramScreen userId={userId} onBack={() => location.assign('?screen=your-programs')} onCreated={() => setSaved(true)} />
      : <ExercisesScreen initialTab={screen} onCreateProgram={() => location.assign('?screen=draft')} />}</div>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>);
