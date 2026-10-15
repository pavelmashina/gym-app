import {useEffect,useRef,useState} from 'react';
import {parseMetricInput, resultFieldsV2, validateResultV2} from '../lib/exerciseResultsV2.js';
import {markResultDraft} from '../lib/resultDraftGuard.js';

const labels = {weight:'Вес, кг',reps:'Повторения',duration_seconds:'Время, с',distance_meters:'Дистанция, м',assistance_weight:'Помощь, кг'};

export default function ResultSetV2({set,contract,configurationKeyValue='standard',equipmentInstanceId=null,onSave,onDelete}) {
  const initial = set.resultV2 || {...contract,metric_version:'v2',weight_unit:'kg',configuration_key:configurationKeyValue,equipment_instance_id:equipmentInstanceId,set_type:set.setType,completed:false};
  const [draft,setDraft] = useState(initial);
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
  function discard(){setDraft(initial);setError('');markDirty(false);}
  async function save(completed) {
    setError('');
    const previous=draft;
    const result={...draft,set_type:set.setType,completed};
    if(!set.resultV2){result.configuration_key=configurationKeyValue;result.equipment_instance_id=equipmentInstanceId||null;}
    delete result.measurement_note;
    for(const field of resultFieldsV2(result.measurement_type))result[field]=parseMetricInput(result[field]);
    if(validateResultV2(result).length){setError('Заполните необходимые значения. Для одностороннего выполнения выберите сторону.');return;}
    setDraft(result);
    setSaving(true);
    markDirty(true);
    try {
      await onSave({...set,resultV2:result,weight:'',reps:'',completed});
      markDirty(false);
    } catch(e) {
      setDraft(previous);
      setError(e.message);
    } finally {setSaving(false);}
  }
  useEffect(()=>{if(!set.resultV2)setDraft(current=>({...current,configuration_key:configurationKeyValue,equipment_instance_id:equipmentInstanceId||null}));},[configurationKeyValue,equipmentInstanceId,set.resultV2]);
  const loadLabel=['dumbbell_each','kettlebell_each'].includes(draft.load_mode)?'Вес одного снаряда, кг':draft.load_mode==='barbell_total'?'Штанга с грифом, кг':draft.load_mode==='bodyweight'?'Дополнительный вес, кг':'Указанный вес, кг';
  return <div className={`result-set-v2 compact${draft.completed?' done':''}`}>
    <span className="result-set-v2-number">{set.setType==='warmup'?'Р':''}{set.setNumber}</span>
    <div className="result-set-v2-fields">{resultFieldsV2(draft.measurement_type).map(field=><label key={field}>
      <span>{field==='weight'?loadLabel:labels[field]}</span><input aria-label={field==='weight'?loadLabel:labels[field]} inputMode={field==='reps'?'numeric':'decimal'} value={draft[field]??''} onChange={e=>patch(field,e.target.value)} disabled={saving}/>
    </label>)}</div>
    {['unilateral','independent'].includes(draft.laterality)&&<label className="result-set-v2-side"><span>Сторона</span><select aria-label="Сторона выполнения" value={draft.side||''} disabled={saving||Boolean(set.resultV2)} onChange={e=>patch('side',e.target.value)}><option value="">—</option><option value="left">Л</option><option value="right">П</option></select></label>}
    <button className="result-set-v2-complete" type="button" disabled={saving} onClick={()=>save(!draft.completed)} aria-label={draft.completed?'Снять отметку':'Записать подход'}>{saving?'…':'✓'}</button>
    <button className="result-set-v2-delete" type="button" disabled={saving} onClick={onDelete} aria-label="Удалить подход">×</button>
    {error&&<p role="alert" className="workout-session-error">{error}</p>}
    {dirty&&<button className="result-set-v2-discard" type="button" disabled={saving} onClick={discard}>Отменить</button>}
  </div>;
}
