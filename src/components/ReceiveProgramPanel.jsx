import { useEffect, useState } from 'react';
import { acceptProgramShare, extractProgramShareCode, incomingProgramShareCode, previewProgramShare } from '../lib/programSharing.js';
import '../program-sharing.css';

export function ReceiveProgramPanel({onAccepted}) {
  const [input,setInput]=useState(()=>incomingProgramShareCode());
  const [preview,setPreview]=useState(null);
  const [acceptedProgramId,setAcceptedProgramId]=useState(null);
  const [loading,setLoading]=useState(false);
  const [accepting,setAccepting]=useState(false);
  const [error,setError]=useState('');

  async function inspect(inputValue) {
    const code=extractProgramShareCode(inputValue);
    setError('');setPreview(null);setAcceptedProgramId(null);
    if(!code){setError('Вставьте корректную ссылку или код приглашения.');return;}
    setLoading(true);
    try{setPreview(await previewProgramShare(code));}
    catch(e){setError(e.message)}
    finally{setLoading(false)}
  }
  useEffect(()=>{
    const code=incomingProgramShareCode();
    if(code)void inspect(code);
  },[]);

  async function accept(){
    if(!preview||accepting)return;
    setAccepting(true);setError('');
    try{
      const newProgramId=await acceptProgramShare(preview.code);
      setAcceptedProgramId(newProgramId);
      const url=new URL(window.location.href);
      url.searchParams.delete('program_share');
      window.history.replaceState(null,'',url.pathname+url.search+url.hash);
      onAccepted?.(newProgramId);
    }catch(e){setError(e.message)}
    finally{setAccepting(false)}
  }

  return <section className="received-program-panel">
    <div className="received-program-heading"><p>Вставьте ссылку или код приглашения. После подтверждения программа появится в разделе «Мои программы».</p></div>
    <form onSubmit={e=>{e.preventDefault();void inspect(input)}}>
      <label htmlFor="received-program-code">Ссылка или код</label>
      <input id="received-program-code" type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={input} onChange={e=>setInput(e.target.value)} placeholder="Вставить приглашение"/>
      <button type="submit" disabled={loading||accepting}>{loading?'Проверяем…':'Открыть приглашение'}</button>
    </form>
    {preview&&<div className="received-program-preview">
      <span>Вам поделились программой</span>
      <h3>{preview.name}</h3>
      <p>Отправитель: {preview.sender_name}</p>
      {preview.description&&<p>{preview.description}</p>}
      <div className="received-program-details"><span>{preview.workout_count} тренировок</span><span>{preview.structure_mode==='cycle'?preview.cycle_repeat_count+' циклов':preview.week_count+' недель'}</span></div>
      {preview.own_program?<p>Это ваша собственная программа — приглашение предназначено другому пользователю.</p>:
        acceptedProgramId||preview.already_accepted?
        <p className="program-share-status">Программа уже добавлена в вашу библиотеку.</p>:
        <button className="program-share-primary" type="button" disabled={accepting} onClick={accept}>{accepting?'Добавляем…':'Принять программу'}</button>}
    </div>}
    {acceptedProgramId&&<button className="received-program-open" type="button" onClick={()=>onAccepted?.(acceptedProgramId)}>Открыть мою программу</button>}
    {error&&<p className="program-share-error" role="alert">{error}</p>}
  </section>;
}
