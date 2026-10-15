import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildCatalogSeed,catalogRecords} from './exercise-catalog-seed.mjs';

export const catalogMigrations=[
  '20261015084238_exercise_catalog_v2_foundation.sql',
  '20261015090011_exercise_machine_profiles.sql',
  '20261015094158_exercise_catalog_v2_api.sql',
  '20261015100010_exercise_result_snapshots_v2.sql',
];
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const legacy=JSON.parse(read('../docs/exercise-catalog-v2/legacy-shared-catalog.json'));
const quote=s=>"'"+s.replaceAll("'","''")+"'";
// Only remove the known outer transaction. Never strip BEGIN inside function bodies.
export function transactionBody(sql){
  const lines=sql.trim().split(/\r?\n/);
  const first=lines.findIndex(line=>line.trim()&&!line.trim().startsWith('--'));
  if(lines[first].trim().toLowerCase()!=='begin;'||lines.at(-1).trim().toLowerCase()!=='commit;')throw Error('Expected one outer transaction');
  lines.splice(first,1);lines.pop();return lines.join('\n');
}
// SQL generation only: no network, billing, credentials or automatic execution.
// The bundle is a rehearsal/controlled-release artifact, not a replacement for
// recording the four migrations in Supabase migration history during deployment.
export function buildCatalogRelease({publish=false}={}){
  const ids=legacy.map(row=>quote(row.id)+'::uuid').join(',');
  const mappingIds=legacy.map(row=>quote(row.id)).join(',');
  const canonicalIds=catalogRecords.map(row=>quote(row.id)+'::uuid').join(',');
  return [
    '-- GYM catalog release; no historical references are remapped.',
    'begin;',"set local lock_timeout='5s';", "set local statement_timeout='120s';",
    `do $$ begin
      if (select count(*) from public.exercises where id=any(array[${ids}]) and owner_id is null)<>436 then
        raise exception 'Source catalog changed: expected all 436 shared UUIDs';
      end if;
    end $$;`,
    ...catalogMigrations.map(name=>transactionBody(read('../supabase/migrations/'+name))),
    transactionBody(buildCatalogSeed({publish})),
    `set constraints all immediate;
    do $$ begin
      if (select count(*) from public.exercises where id=any(array[${ids}]))<>436 then
        raise exception 'Legacy UUID preservation failed';
      end if;
      if (select count(*) from public.exercises where id=any(array[${canonicalIds}]) and canonical_key is not null)<>109 then
        raise exception 'Canonical catalog incomplete';
      end if;
      if (select count(*) from public.exercise_legacy_mappings where legacy_source='public.exercises' and legacy_exercise_id=any(array[${mappingIds}]::text[]))<>436 then
        raise exception 'Legacy mapping coverage incomplete';
      end if;
    end $$;`,
    'commit;',
  ].join('\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.slice(2).some(arg=>arg!=='--publish'))throw Error('Only optional --publish is supported; this command prints SQL, never executes it.');
  process.stdout.write(buildCatalogRelease({publish:process.argv.includes('--publish')}));
}
