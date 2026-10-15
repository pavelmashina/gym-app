export const EMPTY_PROGRAM_FILTERS = { place: '', category: '', level: '' };

export function matchesProgramFilters(program, filters) {
  return (!filters.place || program.trainingPlace === filters.place)
    && (!filters.category || (program.categories ?? []).includes(filters.category))
    && (!filters.level || program.level === filters.level);
}

export function programFilterOptions(programs) {
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  return {
    place: unique(programs.map((program) => program.trainingPlace)),
    category: unique(programs.flatMap((program) => program.categories ?? [])),
    level: unique(programs.map((program) => program.level)),
  };
}
