import {useEffect,useState} from 'react';
import {configurationFields} from '../lib/exerciseConfiguration.js';
import {listExerciseConfigurations,saveExerciseConfiguration} from '../lib/exerciseEquipment.js';

export default function ExerciseConfigurationEditor({exerciseId,equipmentInstanceId,value,onChange,disabled}) {
  const [presets,setPresets]=useState([]),[name,setName]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const connected=import.meta.env.VITE_EXERCISE_RESULTS_V2==='true';
  useEffect(()=>{let active=true;if(connected)listExerciseConfigurations(exerciseId).then(rows=>{if(active)setPresets(rows);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[exerciseId,connected]);
  async function savePreset(){setError('');setSaving(true);try{const saved=await saveExerciseConfiguration({exerciseId,equipmentInstanceId,name,settings:value});setPresets(rows=>[...rows,saved]);setName('');}catch(e){setError(e.message);}finally{setSaving(false);}}
  return <details><summary>Настройки выполнения</summary>
    <small>Оставьте неизвестные значения пустыми. Настройки сохраняются вместе с результатом и отделяют его от других условий.</small>
    <fieldset disabled={disabled||saving}>
      {connected&&<label>Сохранённые настройки<select aria-label="Сохранённые настройки" value="" onChange={e=>{const preset=presets.find(row=>row.id===e.target.value);if(preset)onChange(preset);}}><option value="">Выберите настройки</option>{presets.filter(row=>(row.equipment_instance_id||null)===(equipmentInstanceId||null)).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      <div className="result-set-v2-fields">{configurationFields.map(([field,label,min])=><label key={field}><span>{label}</span><input aria-label={label} inputMode={min==null?'text':'decimal'} value={value[field]??''} onChange={e=>onChange({...value,[field]:e.target.value})}/></label>)}</div>
      {connected&&<><label>Название набора<input value={name} onChange={e=>setName(e.target.value)} placeholder="Например: моя скамья"/></label><button type="button" onClick={savePreset} disabled={!name.trim()}>Сохранить настройки для следующих подходов</button></>}
    </fieldset>{error&&<p role="alert">{error}</p>}
  </details>;
}
