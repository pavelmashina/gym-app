import {useEffect,useRef,useState} from 'react';
import {configurationFields} from '../lib/exerciseConfiguration.js';
import {listExerciseConfigurations,saveExerciseConfiguration} from '../lib/exerciseEquipment.js';
import EquipmentInstancePicker from './EquipmentInstancePicker.jsx';

export default function ExerciseConfigurationEditor({exerciseId,equipmentInstanceId,value,onChange,onEquipmentChange,disabled}) {
  const [presets,setPresets]=useState([]);
  const [name,setName]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [opened,setOpened]=useState(false);
  const [draft,setDraft]=useState(value);
  const loadedRef=useRef(false);
  const changeTimerRef=useRef(null);
  useEffect(()=>setDraft(value),[value]);
  useEffect(()=>()=>{if(changeTimerRef.current)clearTimeout(changeTimerRef.current);},[]);
  function patchDraft(next){
    setDraft(next);
    if(changeTimerRef.current)clearTimeout(changeTimerRef.current);
    changeTimerRef.current=setTimeout(()=>{changeTimerRef.current=null;onChange(next);},250);
  }
  function flushDraft(){
    if(changeTimerRef.current){clearTimeout(changeTimerRef.current);changeTimerRef.current=null;onChange(draft);}
  }
  const connected=import.meta.env.VITE_EXERCISE_RESULTS_V2==='true';

  useEffect(()=>{
    if(!opened||!connected||loadedRef.current)return undefined;
    let active=true;
    loadedRef.current=true;
    listExerciseConfigurations(exerciseId).then(rows=>{if(active)setPresets(rows)}).catch(e=>{if(active)setError(e.message)});
    return()=>{active=false};
  },[exerciseId,connected,opened]);

  async function savePreset(){
    setError('');setSaving(true);
    try{
      const saved=await saveExerciseConfiguration({exerciseId,equipmentInstanceId,name,settings:draft});
      setPresets(rows=>[...rows,saved]);setName('');
    }catch(e){setError(e.message)}finally{setSaving(false)}
  }

  return <details className="exercise-configuration-details" onToggle={event=>setOpened(event.currentTarget.open)}>
    <summary><span aria-hidden="true" className="execution-settings-triangle">▸</span><span>Настройки выполнения</span></summary>
    <div className="exercise-configuration-body">
      <fieldset disabled={disabled||saving}>
        {connected&&presets.length>0&&<label>Сохранённые настройки<select aria-label="Сохранённые настройки" value="" onChange={e=>{const preset=presets.find(row=>row.id===e.target.value);if(preset){setDraft(preset);onChange(preset);}}}><option value="">Выберите настройки</option>{presets.filter(row=>(row.equipment_instance_id||null)===(equipmentInstanceId||null)).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        <div className="result-set-v2-fields">{configurationFields.map(([field,label,min])=><label key={field}><span>{label}</span><input aria-label={label} inputMode={min==null?'text':'decimal'} value={draft[field]??''} onChange={e=>patchDraft({...draft,[field]:e.target.value})} onBlur={flushDraft}/></label>)}</div>
        {connected&&<EquipmentInstancePicker exerciseId={exerciseId} value={equipmentInstanceId} onChange={onEquipmentChange} disabled={disabled||saving} enabled={opened}/>}
        {connected&&<div className="exercise-configuration-save"><label>Название набора<input value={name} onChange={e=>setName(e.target.value)} placeholder="Например: моя скамья"/></label><button type="button" onClick={savePreset} disabled={!name.trim()}>Сохранить набор</button></div>}
      </fieldset>
      {error&&<p role="alert">{error}</p>}
    </div>
  </details>;
}
