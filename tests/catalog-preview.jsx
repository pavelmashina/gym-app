import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {catalogDrafts} from '../data/exercise-catalog/index.mjs';
import identities from '../data/exercise-catalog/identities.json';
import {searchCatalogV2} from '../src/lib/exerciseCatalogV2.js';
import ExerciseTechnique from '../src/components/ExerciseTechnique.jsx';
import ResultSetV2 from '../src/components/ResultSetV2.jsx';
import {formatResultV2} from '../src/lib/exerciseResultsV2.js';
import {assertResultsSaved} from '../src/lib/resultDraftGuard.js';
import '../src/styles.css';
import '../src/exercise-library-picker.css';
import '../src/workout-session-active-v3.css';

function Preview(){
  const [query,setQuery]=useState('');
  const [key,setKey]=useState('forearm_plank');
  const [sets,setSets]=useState({});
  const [guardMessage,setGuardMessage]=useState('');
  const card=catalogDrafts.find(c=>c.canonical_key===key);
  const list=searchCatalogV2(catalogDrafts,{query});
  const contract={exercise_id:identities[key].id,measurement_type:card.measurement_type,load_mode:card.load_mode,laterality:card.laterality,measurement_note:card.measurement_note};
  const set=sets[key]||{id:key,setNumber:1,setType:'working',completed:false,weight:'',reps:''};
  return <main style={{maxWidth:390,margin:'0 auto',padding:16,background:'#fff',color:'#202020',minHeight:'100vh'}}>
    <h1 style={{fontSize:24}}>Каталог · проверка</h1><p>109 карточек. Локальный стенд, без записи в аккаунт.</p>
    <label>Поиск <input aria-label="Поиск" value={query} onChange={e=>{const value=e.target.value;setQuery(value);const found=searchCatalogV2(catalogDrafts,{query:value});if(found.length&&!found.some(c=>c.canonical_key===key))setKey(found[0].canonical_key)}}/></label><p>Найдено: {list.length}</p>
    <select aria-label="Упражнение" value={key} style={{maxWidth:'100%',padding:8}} onChange={e=>setKey(e.target.value)}>{list.map(c=><option key={c.canonical_key} value={c.canonical_key}>{c.name_ru}</option>)}</select>
    <h2>{card.name_ru}</h2><p>Видео пока не добавлено.</p><ExerciseTechnique exercise={card}/>
    <h2>Запись результата</h2><ResultSetV2 key={key} set={set} contract={contract} onSave={async next=>setSets(current=>({...current,[key]:next}))} onDelete={()=>setSets(current=>({...current,[key]:undefined}))}/>
    {set.resultV2&&<p role="status">Сохранено на стенде: {formatResultV2(set.resultV2)}</p>}
    <button type="button" onClick={()=>{try{assertResultsSaved();setGuardMessage('Проверка пройдена: несохранённых подходов нет.');}catch(e){setGuardMessage(e.message);}}}>Проверить завершение</button>
    {guardMessage&&<p role="status">{guardMessage}</p>}
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
