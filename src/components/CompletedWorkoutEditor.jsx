import { useState } from 'react';
import { changeCompletedWorkoutDate, updatePerformedSet } from '../lib/workoutSessions.js';
import { resultFieldsV2 } from '../lib/exerciseResultsV2.js';

const EDITABLE_METRICS = ['weight', 'reps', 'assistance_weight'];
const METRIC_LABELS = { weight: 'Вес, кг', reps: 'Повторы', assistance_weight: 'Помощь, кг' };

function localToday() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function editableFields(set) {
  return set.resultV2
    ? resultFieldsV2(set.resultV2.measurement_type).filter(field => EDITABLE_METRICS.includes(field))
    : ['weight', 'reps'];
}

function initialDraft(set) {
  return {
    weight: set.resultV2?.weight ?? set.weight ?? '',
    reps: set.resultV2?.reps ?? set.reps ?? '',
    assistance_weight: set.resultV2?.assistance_weight ?? '',
  };
}

function completedV2Result(result) {
  const required = result.measurement_type === 'weight_reps'
    ? ['weight', 'reps']
    : result.measurement_type === 'bodyweight_reps' ? ['reps']
      : result.measurement_type === 'assisted_reps' ? ['reps', 'assistance_weight']
        : result.measurement_type === 'carry' ? ['weight'] : [];
  return required.every(field => result[field] != null) &&
    (result.measurement_type !== 'carry' || result.distance_meters != null || result.duration_seconds != null);
}

export function CompletedWorkoutEditor({ entry, onReload }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(entry.workout.completedDate || localToday());
  const [drafts, setDrafts] = useState(() => Object.fromEntries(entry.workout.exercises
    .flatMap(exercise => exercise.sets.map(set => [set.id, initialDraft(set)]))));
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
    for (const exercise of entry.workout.exercises) {
      for (const set of exercise.sets) {
        for (const field of editableFields(set)) {
          const value = String(drafts[set.id]?.[field] ?? '').trim();
          if (!value) continue;
          if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 10000) {
            setError(field === 'reps' ? 'Проверьте число повторений.' : 'Вес должен быть от 0 до 10 000 кг.'); return;
          }
          if (field === 'reps' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 999)) {
            setError('Повторения должны быть от 1 до 999.'); return;
          }
        }
      }
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (date !== entry.workout.completedDate) await changeCompletedWorkoutDate(entry.session.id, date);
      for (const exercise of entry.workout.exercises) {
        for (const set of exercise.sets) {
          const draft = drafts[set.id];
          if (!draft) continue;
          if (set.resultV2) {
            const nextResult = { ...set.resultV2 };
            let modified = false;
            for (const field of editableFields(set)) {
              const raw = String(draft[field] ?? '').trim();
              const value = raw === '' ? null : Number(raw);
              if ((nextResult[field] ?? null) !== value) {
                nextResult[field] = value;
                modified = true;
              }
            }
            if (modified) {
              const completed = completedV2Result(nextResult);
              await updatePerformedSet(set.id, { ...set, resultV2: nextResult, completed });
            }
            continue;
          }
          const weight = String(draft.weight ?? '').trim();
          const reps = String(draft.reps ?? '').trim();
          if (weight === String(set.weight ?? '') && reps === String(set.reps ?? '')) continue;
          await updatePerformedSet(set.id, { ...set, weight, reps, completed: Boolean(reps), resultV2: null });
        }
      }
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
      {entry.workout.exercises.filter(exercise => exercise.sets.some(set => editableFields(set).length)).map(exercise =>
        <section className="completed-editor-exercise" key={exercise.id}>
          <strong>{exercise.name}</strong>
          {exercise.sets.filter(set => editableFields(set).length).map(set =>
            <div className="completed-editor-set" key={set.id}>
              <span>Подход {set.setNumber}</span>
              {editableFields(set).map(field =>
                <label key={field}>{METRIC_LABELS[field]}
                  <input type="number" inputMode={field === 'reps' ? 'numeric' : 'decimal'}
                    min={field === 'reps' ? '1' : '0'} max={field === 'reps' ? '999' : '10000'}
                    step={field === 'reps' ? '1' : 'any'}
                    value={drafts[set.id]?.[field] ?? ''}
                    onChange={event => change(set.id, field, event.target.value)} />
                </label>)}
            </div>)}
        </section>)}
      {error && <p className="completed-editor-error" role="alert">{error}</p>}
      <button className="completed-results-save-button" type="button" disabled={busy} onClick={save}>
        {busy ? 'Сохраняем…' : 'Сохранить изменения'}
      </button>
    </div>}
  </section>;
}
