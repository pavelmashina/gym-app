import { useEffect, useState } from 'react';
import { StatisticsScreen as StatisticsScreenV3 } from './StatisticsScreenV3.jsx';
import { initializeStatisticsCloudSync } from '../lib/statisticsCloudSync.js';
import '../statistics-cloud-sync.css';

export function StatisticsScreenCloud() {
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let disposed = false;
    let stopSync = () => {};

    initializeStatisticsCloudSync({
      onRemoteUpdate: () => {
        if (!disposed) setVersion((current) => current + 1);
      },
    }).then((cleanup) => {
      if (disposed) {
        cleanup?.();
        return;
      }
      stopSync = cleanup || (() => {});
      setReady(true);
    }).catch((error) => {
      console.error('Unable to initialize statistics cloud sync:', error);
      if (!disposed) setReady(true);
    });

    return () => {
      disposed = true;
      stopSync();
    };
  }, []);

  if (!ready) {
    return (
      <div className="phone statistics-phone statistics-sync-loading">
        <main className="statistics-content">
          <section className="statistics-state-card">
            <div className="statistics-spinner" />
            <strong>Синхронизируем статистику…</strong>
            <span>Загружаем данные вашего аккаунта.</span>
          </section>
        </main>
      </div>
    );
  }

  return <StatisticsScreenV3 key={version} />;
}
