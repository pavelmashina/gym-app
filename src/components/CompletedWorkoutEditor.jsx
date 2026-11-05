import { useState } from 'react';
import { changeCompletedWorkoutDate, updatePerformedSet } from '../lib/workoutSessions.js';

function localToday() {
  const date=new Date();
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);
}

export function CompletedWorkoutEditor({ entry, onReload }) {
  const [open,setOpen]=useState(false);
  const [date,setDate]=useState(entry.workout.completedDate || localToday());
  const [drafts,setDrafts]=useState(() => Object.fromEntries(entry.workout.exercises
    .flatMap(exercise=>exercise.sets.filter(set=>!set.resultV2))
    .map(set=>[set.id,{weight:set.weight ?? '',reps:set.reps ?? ''}])));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  function change(id,field,value) {
    setDrafts(current=>({...current,[id]:{...current[id],[field]:value}}));
    setNotice('');setError('');
  }

  async function save() {
    if(busy)return;
    if(!date||date>localToday()){setError('Выберите сегодняшнюю или более раннюю дату.');return;}
    for(const draft of Object.values(drafts)) {
      const weight=String(draft.weight??'').trim(),reps=String(draft.reps??'').trim();
      if(weight&&(!Number.isFinite(Number(weight))||Number(weight)<0||Number(weight)>10000)){setError('Вес должен быть от 0 до 10 000 кг.');return;}
      if(reps&&(!/^\d+$/.test(reps)||Number(reps)<1||Number(reps)>999)){setError('Повторения должны быть от 1 до 999.');return;}
    }
    setBusy(true);setError('');setNotice('');
    try {
      if(date!==entry.workout.completedDate)await changeCompletedWorkoutDate(entry.session.id,date);
      for(const exercise of entry.workout.exercises) {
        for(const set of exercise.sets) {
          const change=drafts[set.id];
          if(!change)continue; // Preserve structured/v2 results.
          const weight=String(change.weight??'').trim(),reps=String(change.reps??'').trim();
          if(weight===String(set.weight??'')&&reps===String(set.reps??''))continue;
          await updatePerformedSet(set.id,{...set,weight,reps,completed:Boolean(reps),resultV2:null});
        }
      }
      await onReload();
      setOpen(false);setNotice('Изменения сохранены.');
    } catch(e){setError(e.message||'Не удалось сохранить изменения.');}
    finally{setBusy(false);}
  }
  return <section className="completed-results-editor">
    <button className="completed-results-edit-button" type="button" onClick={()=>{setOpen(v=>!v);setError('');}}>
      {open?'Скрыть редактирование':'Изменить дату и веса'}
    </button>
    {notice&&<p className="completed-editor-notice" role="status">{notice}</p>}
    {open&&<div className="completed-results-edit-fields">
      <label className="completed-results-date">Дата выполнения
        <input type="date" value={date} max={localToday()} onChange={event=>setDate(event.target.value)}/>
      </label>
      {entry.workout.exercises.map(exercise=><section className="completed-editor-exercise" key={exercise.id}>
        <strong>{exercise.name}</strong>
        {exercise.sets.filter(set=>!set.resultV2).map(set=><div className="completed-editor-set" key={set.id}>
          <span>Подход {set.setNumber}</span>
          <label>Вес, кг<input type="number" inputMode="decimal" min="0" max="10000" step="0.5"
            value={drafts[set.id]?.weight??''} onChange={event=>change(set.id,'weight',event.target.value)}/></label>
          <label>Повторы<input type="number" inputMode="numeric" min="1" max="999"
            value={drafts[set.id]?.reps??''} onChange={event=>change(set.id,'reps',event.target.value)}/></label>
        </div>)}
      </section>)}
      {error&&<p className="completed-editor-error" role="alert">{error}</p>}
      <button className="completed-results-save-button" type="button" disabled={busy} onClick={save}>
        {busy?'Сохраняем…':'Сохранить изменения'}
      </button>
    </div>}
  </section>;
}
