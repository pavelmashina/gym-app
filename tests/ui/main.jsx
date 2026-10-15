import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CreateProgramScreen } from '../../src/components/CreateProgramScreen.jsx';
import { ExercisesScreen } from '../../src/components/ExercisesScreen.jsx';
import '../../src/styles.css';
import '../../src/design-system.css';
function Fixture() {
  const [saved, setSaved] = useState(false);
  const params = new URLSearchParams(location.search);
  const screen = params.get('screen') || 'draft';
  const userId = params.get('user') || 'fixture-a';
  return <><nav><a href="?screen=draft">Конструктор</a> · <a href="?screen=your-programs">Личные</a> · <a href="?screen=completed">Пройденные</a> · <a href="?screen=recommendations">Рекомендации</a> · <a href="?screen=draft&user=fixture-b">Другой аккаунт</a></nav>
    {saved ? <p role="status">Тестовая программа сохранена</p> : screen === 'draft'
      ? <CreateProgramScreen userId={userId} onBack={() => location.assign('?screen=your-programs')} onCreated={() => setSaved(true)} />
      : <ExercisesScreen initialTab={screen} onCreateProgram={() => location.assign('?screen=draft')} />}</>;
}
createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>);
