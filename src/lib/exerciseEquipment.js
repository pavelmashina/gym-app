import {supabase} from './supabase.js';
import {normalizeConfiguration} from './exerciseConfiguration.js';

export async function listExerciseConfigurations(exerciseId) {
  const {data,error}=await supabase.from('exercise_configurations').select('*').eq('exercise_id',exerciseId).is('archived_at',null).order('name');
  if(error)throw new Error('Не удалось загрузить сохранённые настройки.');
  return data||[];
}
export async function saveExerciseConfiguration({exerciseId,equipmentInstanceId,name,settings}) {
  if(!name?.trim())throw new Error('Назовите настройки.');
  const normalized=normalizeConfiguration(settings);
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)throw new Error('Войдите в аккаунт ещё раз.');
  const {data,error}=await supabase.from('exercise_configurations').insert({...normalized,owner_user_id:user.id,
    exercise_id:exerciseId,equipment_instance_id:equipmentInstanceId||null,name:name.trim()}).select('*').single();
  if(error||!data)throw new Error('Не удалось сохранить настройки.');
  return data;
}

export async function listEquipmentForExercise(exerciseId) {
  const {data:links,error}=await supabase.from('exercise_machine_profiles').select('machine_profile_id').eq('exercise_id',exerciseId);
  if(error)throw new Error('Не удалось загрузить типы тренажёров.');
  const ids=(links||[]).map(row=>row.machine_profile_id);
  if(!ids.length)return {profiles:[],instances:[]};
  const [profiles,instances]=await Promise.all([
    supabase.from('machine_profiles').select('id,name_ru,loading_mechanism').in('id',ids).order('name_ru'),
    supabase.from('equipment_instances').select('id,custom_name,manufacturer,model,machine_profile_id').in('machine_profile_id',ids).is('archived_at',null).order('custom_name'),
  ]);
  if(profiles.error||instances.error)throw new Error('Не удалось загрузить ваши тренажёры.');
  return {profiles:profiles.data||[],instances:instances.data||[]};
}

export async function createEquipmentInstance({profileId,name,manufacturer='',model=''}) {
  if(!String(name||'').trim() || !profileId)throw new Error('Укажите название тренажёра и способ нагрузки.');
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)throw new Error('Войдите в аккаунт ещё раз.');
  const {data,error}=await supabase.from('equipment_instances').insert({owner_user_id:user.id,machine_profile_id:profileId,
    custom_name:name.trim(),manufacturer:manufacturer.trim()||null,model:model.trim()||null}).select('id,custom_name,manufacturer,model,machine_profile_id').single();
  if(error||!data)throw new Error('Не удалось сохранить тренажёр.');
  return data;
}
