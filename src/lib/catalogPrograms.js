import { supabase } from './supabase.js';

function mapCatalogProgram(row) {
  const sourcePayload = row.source_payload ?? { cycle: { workouts: [] } };
  const coverImage = sourcePayload.cover_image;
  const validImageName = (name) => typeof name === 'string' && /^[a-z0-9][a-z0-9._-]*\.(?:webp|png|jpg)$/i.test(name);
  const coverUrl = validImageName(coverImage) ? `${import.meta.env.BASE_URL}assets/${coverImage}` : null;
  const coverDetailImage = sourcePayload.cover_image_detail;
  const coverDetailUrl = validImageName(coverDetailImage) ? `${import.meta.env.BASE_URL}assets/${coverDetailImage}` : coverUrl;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    categories: row.categories ?? [],
    trainingPlace: row.training_place ?? '',
    equipment: row.equipment ?? '',
    level: row.level ?? '',
    workoutCount: row.workout_count ?? 0,
    createdAt: row.created_at || null,
    sourcePayload,
    coverUrl,
    coverDetailUrl,
  };
}

export async function listCatalogPrograms() {
  const { data, error } = await supabase
    .from('catalog_programs')
    .select('id, name, description, categories, training_place, equipment, level, workout_count, source_payload, created_at')
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
    .select('id, name, description, categories, training_place, equipment, level, workout_count, source_payload, created_at')
    .eq('id', programId)
    .eq('published', true)
    .single();

  if (error || !data) {
    console.error('Unable to load catalog program:', error);
    throw new Error('Не удалось открыть программу из каталога.');
  }

  return mapCatalogProgram(data);
}

export async function adoptCatalogProgram(programId) {
  const { data, error } = await supabase.rpc('adopt_catalog_program', {
    p_catalog_program_id: programId,
  });

  if (error || !data) {
    console.error('Unable to adopt catalog program:', error);
    throw new Error('Не удалось добавить программу. Попробуйте ещё раз.');
  }

  return data;
}
