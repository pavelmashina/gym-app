import { supabase } from './supabase.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractProgramShareCode(value) {
  const input = String(value || '').trim();
  if (UUID_PATTERN.test(input)) return input.toLowerCase();
  try {
    const url = new URL(input, window.location.origin);
    const code = url.searchParams.get('program_share');
    return UUID_PATTERN.test(code || '') ? code.toLowerCase() : '';
  } catch { return ''; }
}

export function incomingProgramShareCode() {
  if (typeof window === 'undefined') return '';
  return extractProgramShareCode(new URLSearchParams(window.location.search).get('program_share'));
}

export function buildProgramShareUrl(code) {
  const base = import.meta.env.BASE_URL || '/';
  const url = new URL(base, window.location.origin);
  url.searchParams.set('program_share', code);
  return url.toString();
}

export async function createProgramShare(programId) {
  const { data, error } = await supabase.rpc('create_program_share', { p_program_id: programId });
  if (error || !data) throw new Error(error?.message || 'Не удалось создать ссылку на программу.');
  return data;
}

export async function listProgramShares(programId) {
  const { data, error } = await supabase.from('program_shares')
    .select('code,created_at,expires_at')
    .eq('source_program_id', programId)
    .is('revoked_at',null)
    .gt('expires_at',new Date().toISOString())
    .order('created_at',{ascending:false});
  if (error) throw new Error('Не удалось загрузить ссылки на программу.');
  return data || [];
}

export async function revokeProgramShare(code) {
  const { data, error } = await supabase.from('program_shares').delete().eq('code',code).select('code').single();
  if (error || !data) throw new Error('Не удалось отозвать ссылку.');
}

export async function previewProgramShare(code) {
  const { data, error } = await supabase.rpc('preview_program_share', { p_code: code });
  if (error || !data) throw new Error('Приглашение не найдено или срок ссылки истёк.');
  return data;
}

export async function acceptProgramShare(code) {
  const { data, error } = await supabase.rpc('accept_program_share', { p_code: code });
  if (error || !data) throw new Error(error?.message || 'Не удалось принять программу.');
  return data;
}
