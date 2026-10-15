import {useEffect,useState} from 'react';
import {listEquipmentForExercise,createEquipmentInstance} from '../lib/exerciseEquipment.js';

export default function EquipmentInstancePicker({exerciseId,value,onChange,disabled}) {
  const [data,setData]=useState({profiles:[],instances:[]});
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [draft,setDraft]=useState({profileId:'',name:'',manufacturer:'',model:''});
  useEffect(()=>{let active=true;listEquipmentForExercise(exerciseId).then(result=>{if(active)setData(result)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[exerciseId]);
  async function create(){setSaving(true);setError('');try{
    const instance=await createEquipmentInstance(draft);
    setData(current=>({...current,instances:[...current.instances,instance]}));onChange(instance.id);setOpen(false);
  }catch(e){setError(e.message)}finally{setSaving(false)}}
  if(!data.profiles.length && !error)return null;
  return <div>
    <label>Мой тренажёр <select aria-label="Мой тренажёр" value={value||''} disabled={disabled||saving} onChange={e=>onChange(e.target.value||null)}><option value="">Не указан — без сравнения машин</option>{data.instances.map(i=><option key={i.id} value={i.id}>{i.custom_name}{i.model?` · ${i.model}`:''}</option>)}</select></label>
    {!disabled&&<button type="button" onClick={()=>setOpen(!open)}>{open?'Отмена':'Добавить тренажёр'}</button>}
    {open&&!disabled&&<div className="result-set-v2-fields">
      <label>Название в моём зале <input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      <label>Способ нагрузки <select value={draft.profileId} onChange={e=>setDraft({...draft,profileId:e.target.value})}><option value="">Выберите по машине</option>{data.profiles.map(p=><option value={p.id} key={p.id}>{p.name_ru}</option>)}</select></label>
      <label>Производитель (необязательно)<input value={draft.manufacturer} onChange={e=>setDraft({...draft,manufacturer:e.target.value})}/></label>
      <label>Модель (необязательно)<input value={draft.model} onChange={e=>setDraft({...draft,model:e.target.value})}/></label>
      <button type="button" disabled={saving} onClick={create}>{saving?'Сохраняем…':'Сохранить тренажёр'}</button>
    </div>}
    {error&&<p role="alert">{error}</p>}
  </div>;
}
