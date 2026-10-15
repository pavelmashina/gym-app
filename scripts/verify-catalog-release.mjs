import {spawnSync} from 'node:child_process';
const tests=['commercial-foundation-contracts','workout-lifecycle-contracts','mvp-core-contracts','mvp-product-qa-contracts','mobile-pwa-contracts','program-draft-filters','exercise-catalog-duplicates','exercise-catalog-v2-content','exercise-catalog-v2-db','exercise-catalog-v2-seed','exercise-library-v2','exercise-results-v2','exercise-results-v2-db','exercise-results-v2-client','exercise-configuration','exercise-catalog-live-integration'];
for(const name of tests){
  const result=spawnSync(process.execPath,[`tests/${name}.mjs`],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status||1);
}
for(const enabled of ['false','true']){
  const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,VITE_EXERCISE_CATALOG_V2:enabled,VITE_EXERCISE_RESULTS_V2:enabled}});
  if(result.status!==0)process.exit(result.status||1);
}
console.log(`Release checks passed: ${tests.length} suites and both feature-flag builds. This does not deploy or modify production.`);
