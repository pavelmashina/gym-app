import {compareResultsV2,formatResultV2} from '../lib/exerciseResultsV2.js';

export default function ResultStatisticsV2({sets}) {
  const rows=sets.filter(set=>set.resultV2 && set.setType==='working').sort((a,b)=>(b.completedAt||b.date).localeCompare(a.completedAt||a.date));
  if(!rows.length)return null;
  return <section className="statistics-section"><h2>Результаты по типам нагрузки</h2>
    <p className="statistics-muted">Сравнение только при одинаковых условиях. Эти результаты не включены в старый тоннаж и e1RM.</p>
    {rows.map((set,index)=>{
      const previous=rows.slice(index+1).find(other=>(other.date<set.date || (other.completedAt && set.completedAt && other.completedAt<set.completedAt)) && compareResultsV2(set.resultV2,other.resultV2)!==null);
      const delta=previous?compareResultsV2(set.resultV2,previous.resultV2):null;
      return <div className="statistics-exercise-row statistics-exercise-row-static" key={set.id}><div className="statistics-exercise-copy"><strong>{set.exerciseName}</strong><span>{set.date} · {formatResultV2(set.resultV2)}</span><small>{delta===null?'Нет сопоставимого результата':delta>0?'Улучшение относительно предыдущего сопоставимого подхода':delta<0?'Ниже предыдущего сопоставимого подхода':'Без изменения'}</small></div></div>;
    })}
  </section>;
}
