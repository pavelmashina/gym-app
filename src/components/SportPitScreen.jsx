import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { SPORTPIT_IMAGES } from '../data/sportpitImages.js';
import '../sportpit-screen.css';

function BackIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>}
function SearchIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>}

function ProductVisual({ item, compact=false }){
  const image = item.image_url || SPORTPIT_IMAGES[item.slug];
  return <div className={`sportpit-product-visual${compact?' compact':''}`}>{image ? <img src={image} alt={item.title} loading={compact ? 'lazy' : 'eager'} /> : <div className="sportpit-jar"><span>{item.title}</span><b>SPORT</b></div>}</div>;
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
  return <div className="sportpit-screen sportpit-detail-screen">
    <header className="sportpit-detail-topbar"><button type="button" onClick={onBack} aria-label="Назад"><BackIcon/></button><strong>СпортПит</strong><span/></header>
    <main className="sportpit-detail-content">
      <ProductVisual item={item}/>
      <div className="sportpit-detail-title"><span>{item.category}</span><h1>{item.title}</h1><p>{item.description}</p></div>
      <section className="sportpit-warning"><strong>Важно</strong><p>{item.caution}</p></section>
      <section className="sportpit-detail-card"><h2>Рекомендации по приёму</h2><p>{item.recommendations}</p></section>
      <section className="sportpit-detail-card"><h2>Состав</h2><ul>{composition.map((value,index)=><li key={`${index}-${value}`}>{value}</li>)}</ul></section>
      <section className="sportpit-detail-card"><div className="sportpit-kbju-head"><div><h2>Примерное КБЖУ</h2><span>{item.serving_label}</span></div></div><div className="sportpit-kbju"><div><strong>{Number(item.calories)}</strong><span>ккал</span></div><div><strong>{Number(item.protein_g)} г</strong><span>Белки</span></div><div><strong>{Number(item.fat_g)} г</strong><span>Жиры</span></div><div><strong>{Number(item.carbs_g)} г</strong><span>Углеводы</span></div></div><small>Фактические значения зависят от конкретного продукта и производителя — проверяйте этикетку.</small></section>
    </main>
  </div>;
}

export function SportPitScreen(){
  const [items,setItems]=useState([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState(null);

  useEffect(()=>{let active=true;setLoading(true);setError('');supabase.from('supplement_catalog').select('id,slug,title,category,short_description,description,recommendations,composition,calories,protein_g,fat_g,carbs_g,serving_label,image_url,caution,sort_order').eq('is_active',true).order('sort_order',{ascending:true}).then(({data,error:requestError})=>{if(!active)return;if(requestError){console.error('Unable to load supplement catalog:',requestError);setError('Не удалось загрузить каталог.');}else setItems(data||[]);setLoading(false);});return()=>{active=false};},[]);

  const filtered=useMemo(()=>{const normalized=query.trim().toLocaleLowerCase('ru');if(!normalized)return items;return items.filter(item=>[item.title,item.category,item.short_description].filter(Boolean).some(value=>value.toLocaleLowerCase('ru').includes(normalized)));},[items,query]);

  if(selected)return <SupplementDetails item={selected} onBack={()=>setSelected(null)}/>;

  return <div className="sportpit-screen"><header className="sportpit-appbar"><div><span>Справочник</span><h1>СпортПит</h1></div></header><main className="sportpit-content">
    <label className="sportpit-search"><SearchIcon/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск по названию" aria-label="Поиск спортивного питания"/>{query&&<button type="button" aria-label="Очистить поиск" onClick={()=>setQuery('')}>×</button>}</label>
    <section className="sportpit-catalog-head"><div><span>Каталог</span><h2>Спортивное питание</h2></div><strong>{filtered.length}</strong></section>
    <section className="sportpit-global-warning"><strong>Перед применением</strong><span>Любые добавки следует использовать после консультации со специалистом и с учётом состояния здоровья, питания и лекарств.</span></section>
    {loading&&<div className="sportpit-state">Загружаем каталог…</div>}{error&&<div className="sportpit-state error">{error}</div>}{!loading&&!error&&filtered.length===0&&<div className="sportpit-state">Ничего не найдено.</div>}
    {!loading&&!error&&<div className="sportpit-list">{filtered.map(item=><SupplementCard key={item.id} item={item} onOpen={setSelected}/>)}</div>}
  </main><SportPitBottomNav/></div>;
}
