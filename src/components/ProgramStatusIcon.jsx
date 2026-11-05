/** Compact activity marker shared by program lists and the program title. */
export function ProgramStatusIcon({ tone = 'not-started', label = 'Состояние программы', className = '' }) {
  const complete = tone === 'completed';
  return <span className={`program-status-icon ${tone}${className ? ` ${className}` : ''}`} role="img" aria-label={label} title={label}>
    {complete
      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11" /></svg>
      : <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 5.5 19 12 8 18.5Z" /></svg>}
  </span>;
}
