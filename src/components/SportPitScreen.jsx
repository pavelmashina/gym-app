import { useEffect, useMemo, useState } from 'react';
import { RootSectionHeader } from './RootSectionHeader.jsx';
import { supabase } from '../lib/supabase.js';
import { SPORTPIT_IMAGES } from '../data/sportpitImages.js';
import '../sportpit-screen.css';

function BackIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>}
function SearchIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>}

function ProductVisual({ item, compact = false }) {
  // The catalog card and detail page show the same image, without substitutions.
  const fallback = SPORTPIT_IMAGES[item.slug] || '';
  const primary = item.image_url || fallback;
  const [source, setSource] = useState(primary);
  useEffect(() => setSource(primary), [primary]);
  return <div className={`sportpit-product-visual${compact ? ' compact' : ''}`}>
    {source
      ? <img src={source} alt={item.title} loading={compact ? 'lazy' : 'eager'} decoding="async" onError={() => setSource((current) => current !== fallback ? fallback : '')} />
      : <div className="sportpit-jar"><span>{item.title}</span><b>SPORT</b></div>}
  </div>;
}

function SupplementCard({ item, onOpen }){
  return <button className="sportpit-card" type="button" onClick={()=>onOpen(item)}>
    <ProductVisual item={item} compact/>
    <span className="sportpit-card-copy"><span>{item.category}</span><strong>{item.title}</strong><small>{item.short_description}</small></span>
    <b className="sportpit-card-arrow">›</b>
  </button>;
}

function SupplementDetails({ item, onBack }){
  const composition=Array.isArray(item.composition)?item.composition:[];
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (!infoOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setInfoOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [infoOpen]);

  return <div className="sportpit-screen sportpit-detail-screen">
    <header className="sportpit-detail-topbar">
      <button type="button" onClick={onBack} aria-label="Назад"><BackIcon /></button>
      <div className="sportpit-topbar-heading">
        <h1 className="sportpit-topbar-title">{item.title}</h1>
        <button type="button" className="sportpit-info-toggle sportpit-topbar-info" aria-label="Информация и меры предосторожности" aria-haspopup="dialog" onClick={() => setInfoOpen(true)}>i</button>
      </div>
      <span aria-hidden="true" />
    </header>
    <main className="sportpit-detail-content">
      <ProductVisual item={item}/>
      <p className="sportpit-detail-description">{item.description}</p>
      <section className="sportpit-detail-card"><h2>Рекомендации по приёму</h2><p>{item.recommendations}</p></section>
      <section className="sportpit-detail-card"><h2>Состав</h2><ul>{composition.map((value,index)=><li key={`${index}-${value}`}>{value}</li>)}</ul></section>
      <section className="sportpit-detail-card"><div className="sportpit-kbju-head"><div><h2>Примерное КБЖУ</h2><span>{item.serving_label}</span></div></div><div className="sportpit-kbju"><div><strong>{Number(item.calories)}</strong><span>ккал</span></div><div><strong>{Number(item.protein_g)} г</strong><span>Белки</span></div><div><strong>{Number(item.fat_g)} г</strong><span>Жиры</span></div><div><strong>{Number(item.carbs_g)} г</strong><span>Углеводы</span></div></div><small>Фактические значения зависят от конкретного продукта и производителя — проверяйте этикетку.</small></section>
    </main>
    {infoOpen && <div className="sportpit-info-overlay">
      <button type="button" className="sportpit-info-scrim" aria-label="Закрыть информацию" onClick={() => setInfoOpen(false)} />
      <section className="sportpit-info-dialog" role="dialog" aria-modal="true" aria-labelledby="sportpit-info-title">
        <header><h2 id="sportpit-info-title">Важно знать</h2><button type="button" className="sportpit-info-close" onClick={() => setInfoOpen(false)} aria-label="Закрыть" autoFocus>×</button></header>
        <p>{item.caution || 'Перед применением спортивных добавок проконсультируйтесь со специалистом.'}</p>
        <button type="button" className="sportpit-info-done" onClick={() => setInfoOpen(false)}>Понятно</button>
      </section>
    </div>}
  </div>;
}

export function SportPitScreen(){
  const [items,setItems]=useState([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState(null);

  useEffect(()=>{
    let active=true;
    async function loadCatalog(){
      setLoading(true);
      setError('');
      try {
        const {data,error:requestError}=await supabase.from('supplement_catalog')
          .select('id,slug,title,category,short_description,description,recommendations,composition,calories,protein_g,fat_g,carbs_g,serving_label,image_url,caution,sort_order')
          .eq('is_active',true)
          .order('sort_order',{ascending:true});
        if(!active)return;
        if(requestError)throw requestError;
        setItems(Array.isArray(data)?data:[]);
      } catch(requestError) {
        if(!active)return;
        console.error('Unable to load supplement catalog:',requestError);
        setItems([]);
        setError('Не удалось загрузить каталог.');
      } finally {
        if(active)setLoading(false);
      }
    }
    loadCatalog();
    return()=>{active=false};
  },[]);

  const filtered=useMemo(()=>{const normalized=query.trim().toLocaleLowerCase('ru');if(!normalized)return items;return items.filter(item=>[item.title,item.category,item.short_description].filter(Boolean).some(value=>value.toLocaleLowerCase('ru').includes(normalized)));},[items,query]);

  return <div className="sportpit-stack">
    <div className="sportpit-screen sportpit-catalog-screen" aria-hidden={Boolean(selected)} inert={Boolean(selected) ? true : undefined}>
      <RootSectionHeader title="СпортПит" /><main className="sportpit-content">
    <label className="sportpit-search"><SearchIcon/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск по названию" aria-label="Поиск спортивного питания"/>{query&&<button type="button" aria-label="Очистить поиск" onClick={()=>setQuery('')}>×</button>}</label>
    <section className="sportpit-global-warning"><strong>Перед применением</strong><span>Любые добавки следует использовать после консультации со специалистом и с учётом состояния здоровья, питания и лекарств.</span></section>
    {loading&&<div className="sportpit-state">Загружаем каталог…</div>}{error&&<div className="sportpit-state error">{error}</div>}{!loading&&!error&&filtered.length===0&&<div className="sportpit-state">Ничего не найдено.</div>}
    {!loading&&!error&&<div className="sportpit-list">{filtered.map(item=><SupplementCard key={item.id} item={item} onOpen={setSelected}/>)}</div>}
  </main></div>
    {selected && <SupplementDetails item={selected} onBack={() => setSelected(null)} />}
  </div>;
}
