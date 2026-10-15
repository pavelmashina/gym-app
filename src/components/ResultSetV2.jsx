import {useEffect,useRef,useState} from 'react';
import {parseMetricInput, resultFieldsV2, validateResultV2} from '../lib/exerciseResultsV2.js';
import EquipmentInstancePicker from './EquipmentInstancePicker.jsx';
import ExerciseConfigurationEditor from './ExerciseConfigurationEditor.jsx';
import {configurationKey,parseConfigurationKey} from '../lib/exerciseConfiguration.js';
import {markResultDraft} from '../lib/resultDraftGuard.js';

const labels = {weight:'Вес, кг',reps:'Повторения',duration_seconds:'Время, с',distance_meters:'Дистанция, м',assistance_weight:'Помощь, кг'};

export default function ResultSetV2({set,contract,onSave,onDelete}) {
  const initial = set.resultV2 || {...contract,metric_version:'v2',weight_unit:'kg',configuration_key:'standard',set_type:set.setType,completed:false};
  const [draft,setDraft] = useState(initial);
  const [settings,setSettings] = useState(()=>parseConfigurationKey(initial.configuration_key));
  const [dirty,setDirty] = useState(false);
  const dirtyRef=useRef(false);
  function markDirty(value){dirtyRef.current=value;setDirty(value);markResultDraft(set.id,value);}
  useEffect(()=>{
    const warn=e=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return()=>{window.removeEventListener('beforeunload',warn);markResultDraft(set.id,false);};
  },[set.id]);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const patch = (key,value) => {markDirty(true);setDraft(current=>({...current,[key]:value}));};
  function discard(){setDraft(initial);setSettings(parseConfigurationKey(initial.configuration_key));setError('');markDirty(false);}
  async function save(completed) {
    setError('');setSaving(true);markDirty(true);
    try {
      const result={...draft,set_type:set.setType,completed};
      if(!set.resultV2)result.configuration_key=configurationKey(settings);
      delete result.measurement_note;
      for(const field of resultFieldsV2(result.measurement_type))result[field]=parseMetricInput(result[field]);
      if(validateResultV2(result).length)throw new Error('Заполните необходимые значения. Для одностороннего выполнения выберите сторону.');
      await onSave({...set,resultV2:result,weight:'',reps:'',completed});
      setDraft(result);
      markDirty(false);
    } catch(e) {setError(e.message);} finally {setSaving(false);}
  }
  const loadLabel=['dumbbell_each','kettlebell_each'].includes(draft.load_mode)?'Вес одного снаряда, кг':draft.load_mode==='barbell_total'?'Штанга с грифом, кг':draft.load_mode==='bodyweight'?'Дополнительный вес, кг':'Указанный вес, кг';
  return <div className="result-set-v2">
    <strong>{set.setType==='warmup'?'Разминка':'Подход'} {set.setNumber}{set.completed?' · записан':''}</strong>
    <div className="result-set-v2-fields">{resultFieldsV2(draft.measurement_type).map(field=><label key={field}>
      <span>{field==='weight'?loadLabel:labels[field]}</span><input aria-label={field==='weight'?loadLabel:labels[field]} inputMode={field==='reps'?'numeric':'decimal'} value={draft[field]??''} onChange={e=>patch(field,e.target.value)} disabled={saving}/>
    </label>)}</div>
    {['unilateral','independent'].includes(draft.laterality)&&<label>Сторона <select aria-label="Сторона выполнения" value={draft.side||''} disabled={saving||Boolean(set.resultV2)} onChange={e=>patch('side',e.target.value)}><option value="">Выберите</option><option value="left">Левая</option><option value="right">Правая</option></select></label>}
    <ExerciseConfigurationEditor exerciseId={draft.exercise_id} equipmentInstanceId={draft.equipment_instance_id} value={settings} onChange={value=>{setSettings(value);markDirty(true);}} disabled={saving||Boolean(set.resultV2)}/>
    {import.meta.env.VITE_EXERCISE_RESULTS_V2==='true' && <EquipmentInstancePicker exerciseId={draft.exercise_id} value={draft.equipment_instance_id} onChange={value=>patch('equipment_instance_id',value)} disabled={saving||Boolean(set.resultV2)}/>}
    {['stack','plates','assistance','machine_indicated'].includes(draft.load_mode)&&!draft.equipment_instance_id&&<small>Экземпляр тренажёра не указан: результат сохраняется, но не сравнивается с другими машинами.</small>}
    {contract?.measurement_note&&<small>{contract.measurement_note}</small>}
    <div className="add-set-actions"><button type="button" disabled={saving} onClick={()=>save(!set.completed)}>{saving?'Сохраняем…':set.completed?'Снять отметку':'Записать подход'}</button><button type="button" disabled={saving} onClick={()=>save(set.completed)}>Сохранить</button><button type="button" disabled={saving} onClick={onDelete}>Удалить</button></div>
    {dirty&&<><small role="status">Есть несохранённые изменения</small><button type="button" disabled={saving} onClick={discard}>Отменить изменения</button></>}
    {error&&<p role="alert" className="workout-session-error">{error}</p>}
  </div>;
}
