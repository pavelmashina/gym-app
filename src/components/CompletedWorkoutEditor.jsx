import { useState } from 'react';
import { changeCompletedWorkoutDate, updatePerformedSet } from '../lib/workoutSessions.js';
import { editableCompletedSetFields, initialCompletedSetDraft, prepareCompletedSetUpdate } from '../lib/completedWorkoutEdits.js';

const METRIC_LABELS = { weight: 'Вес, кг', reps: 'Повторы', assistance_weight: 'Помощь, кг' };

function localToday() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function CompletedWorkoutEditor({ entry, onReload }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(entry.workout.completedDate || localToday());
  const [drafts, setDrafts] = useState(() => Object.fromEntries(entry.workout.exercises
    .flatMap(exercise => exercise.sets.map(set => [set.id, initialCompletedSetDraft(set)]))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function change(id, field, value) {
    setDrafts(current => ({ ...current, [id]: { ...current[id], [field]: value } }));
    setNotice('');
    setError('');
  }

  async function save() {
    if (busy) return;
    if (!date || date > localToday()) { setError('Выберите сегодняшнюю или более раннюю дату.'); return; }

    // Validate all checkmarks and metrics before altering the date or any set.
    let changes;
    try {
      changes = entry.workout.exercises.flatMap(exercise => exercise.sets.flatMap(set => {
        const values = prepareCompletedSetUpdate(set, drafts[set.id]);
        return values ? [{ id: set.id, values }] : [];
      }));
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (date !== entry.workout.completedDate) await changeCompletedWorkoutDate(entry.session.id, date);
      for (const change of changes) await updatePerformedSet(change.id, change.values);
      await onReload();
      setOpen(false);
      setNotice('Изменения сохранены.');
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить изменения.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="completed-results-editor">
    <button className="completed-results-edit-button" type="button" onClick={() => { setOpen(value => !value); setError(''); }}>
      {open ? 'Скрыть редактирование' : 'Изменить дату и веса'}
    </button>
    {notice && <p className="completed-editor-notice" role="status">{notice}</p>}
    {open && <div className="completed-results-edit-fields">
      <label className="completed-results-date">Дата выполнения
        <input type="date" value={date} max={localToday()} onChange={event => setDate(event.target.value)} />
      </label>
      {entry.workout.exercises.filter(exercise => exercise.sets.length).map(exercise =>
        <section className="completed-editor-exercise" key={exercise.id}>
          <strong>{exercise.name}</strong>
          {exercise.sets.map(set =>
            <div className="completed-editor-set" key={set.id}>
              <span>Подход {set.setNumber}</span>
              {editableCompletedSetFields(set).map(field =>
                <label key={field}>{METRIC_LABELS[field]}
                  <input type="number" inputMode={field === 'reps' ? 'numeric' : 'decimal'}
                    min={field === 'reps' ? '1' : '0'} max={field === 'reps' ? '999' : '10000'}
                    step={field === 'reps' ? '1' : 'any'}
                    value={drafts[set.id]?.[field] ?? ''}
                    onChange={event => change(set.id, field, event.target.value)} disabled={busy} />
                </label>)}
              <label className="completed-editor-completion">
                <input type="checkbox" checked={Boolean(drafts[set.id]?.completed)}
                  onChange={event => change(set.id, 'completed', event.target.checked)} disabled={busy} />
                <span>Выполнен</span>
              </label>
            </div>)}
        </section>)}
      {error && <p className="completed-editor-error" role="alert">{error}</p>}
      <button className="completed-results-save-button" type="button" disabled={busy} onClick={save}>
        {busy ? 'Сохраняем…' : 'Сохранить изменения'}
      </button>
    </div>}
  </section>;
}
