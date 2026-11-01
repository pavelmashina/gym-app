import { useEffect, useState } from 'react';
import { buildProgramShareUrl, createProgramShare, listProgramShares, revokeProgramShare } from '../lib/programSharing.js';
import '../program-sharing.css';

function ShareIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4m-7.5 6.8 7.5 4.4"/></svg>;
}

export function ShareProgramButton({programId}) {
  const [open,setOpen]=useState(false);
  const [shares,setShares]=useState([]);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(false);

  useEffect(()=>{
    if(!open)return undefined;
    let active=true;
    setLoading(true);setError('');
    listProgramShares(programId).then(rows=>{if(active)setShares(rows)})
      .catch(e=>{if(active)setError(e.message)})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[open,programId]);

  async function create(){
    setBusy('create');setError('');setNotice('');
    try{
      const code=await createProgramShare(programId);
      setShares(current=>[{code,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+30*86400000).toISOString()},...current]);
      await copy(code);
    }catch(e){setError(e.message)}finally{setBusy('')}
  }
  async function copy(code){
    const link=buildProgramShareUrl(code);
    try{
      await navigator.clipboard.writeText(link);
      setNotice('Ссылка скопирована.');
    }catch{
      setNotice('Скопируйте ссылку из поля ниже.');
    }
  }
  async function remove(code){
    setBusy(code);setError('');setNotice('');
    try{
      await revokeProgramShare(code);
      setShares(current=>current.filter(item=>item.code!==code));
      setNotice('Ссылка отозвана.');
    }catch(e){setError(e.message)}finally{setBusy('')}
  }
  return <>
    <button className="program-share-trigger" type="button" onClick={()=>setOpen(true)}><ShareIcon/> Поделиться программой</button>
    {open&&<div className="program-share-overlay" role="dialog" aria-modal="true" aria-label="Поделиться программой">
      <button className="program-share-scrim" type="button" aria-label="Закрыть" onClick={()=>!busy&&setOpen(false)}/>
      <section className="program-share-sheet">
        <header><div><span>Моя программа</span><h2>Поделиться</h2></div><button type="button" aria-label="Закрыть" disabled={!!busy} onClick={()=>setOpen(false)}>×</button></header>
        <p>Отправьте ссылку другому пользователю GYM APP. После принятия он получит собственную копию программы, которую сможет изменять и проходить независимо от вас.</p>
        <button className="program-share-primary" type="button" disabled={!!busy} onClick={create}>{busy==='create'?'Создаём…':'+ Создать ссылку'}</button>
        {loading&&<p>Загружаем ссылки…</p>}
        {!loading&&shares.length>0&&<div className="program-share-list"><strong>Действующие ссылки</strong>{shares.map(item=><div className="program-share-link-card" key={item.code}>
          <label><span>Ссылка (до {new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric'}).format(new Date(item.expires_at))})</span>
            <input value={buildProgramShareUrl(item.code)} readOnly onFocus={e=>e.currentTarget.select()}/></label>
          <div><button type="button" onClick={()=>copy(item.code)} disabled={!!busy}>Копировать</button><button className="danger" type="button" onClick={()=>remove(item.code)} disabled={!!busy}>{busy===item.code?'Отзываем…':'Отозвать'}</button></div>
        </div>)}</div>}
        {error&&<p className="program-share-error" role="alert">{error}</p>}
        {notice&&<p className="program-share-status" role="status">{notice}</p>}
      </section>
    </div>}
  </>;
}
