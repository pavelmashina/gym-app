import { supabase } from './supabase.js';

function mapCatalogProgram(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    categories: row.categories ?? [],
    trainingPlace: row.training_place ?? '',
    level: row.level ?? '',
    weekCount: row.week_count ?? 1,
    workoutCount: row.workout_count ?? 0,
    sourcePayload: row.source_payload ?? { weeks: [] },
  };
}

export async function listCatalogPrograms() {
  const { data, error } = await supabase
    .from('catalog_programs')
    .select('id, name, description, categories, training_place, level, week_count, workout_count, source_payload')
    .eq('published', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Unable to load catalog programs:', error);
    throw new Error('Не удалось загрузить каталог программ.');
  }

  return (data ?? []).map(mapCatalogProgram);
}

export async function getCatalogProgram(programId) {
  const { data, error } = await supabase
    .from('catalog_programs')
    .select('id, name, description, categories, training_place, level, week_count, workout_count, source_payload')
    .eq('id', programId)
    .eq('published', true)
    .single();

  if (error || !data) {
    console.error('Unable to load catalog program:', error);
    throw new Error('Не удалось открыть программу из каталога.');
  }

  return mapCatalogProgram(data);
}
