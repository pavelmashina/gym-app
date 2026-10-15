export const configurationFields = [
  ['grip_width_cm','Ширина хвата, см',0,200],
  ['bench_angle_degrees','Угол скамьи, °',-90,90],
  ['seat_setting','Положение сиденья'],['support_setting','Положение опоры'],
  ['safety_stop_setting','Страховочные упоры'],['range_of_motion_note','Амплитуда'],['notes','Другие условия'],
];
const prefix='settings-v1:';
export function normalizeConfiguration(input={}) {
  return Object.fromEntries(configurationFields.map(([key,label,min,max])=>{
    const raw=input[key];
    if(raw==null || String(raw).trim()==='')return [key,null];
    if(min!=null){
      const text=String(raw).trim().replace(',','.');
      const n=Number(text);
      if(!/^-?\d+(?:\.\d+)?$/.test(text)||!Number.isFinite(n)||n<min||n>max)throw new Error(`${label}: допустимо от ${min} до ${max}.`);
      return [key,n];
    }
    const text=String(raw).trim();
    if(text.length>500)throw new Error(`${label}: не более 500 символов.`);
    return [key,text];
  }));
}
export function configurationKey(input) {
  const normalized=normalizeConfiguration(input);
  if(Object.values(normalized).every(v=>v==null))return 'standard';
  // Snapshot VALUES, never a mutable template id. Machine id is compared separately.
  return prefix+JSON.stringify(configurationFields.map(([key])=>normalized[key]));
}
export function parseConfigurationKey(key) {
  if(!key||key==='standard')return {};
  if(!key.startsWith(prefix))return {notes:key};
  try {const values=JSON.parse(key.slice(prefix.length));return normalizeConfiguration(Object.fromEntries(configurationFields.map(([field],i)=>[field,values[i]])));}
  catch {return {notes:key};}
}
