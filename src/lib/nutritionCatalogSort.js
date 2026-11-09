/** Shared sort modes for recipe and ready-made meal-plan catalogs. */
export const NUTRITION_SORT_OPTIONS = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'title-asc', label: 'Название: А–Я' },
  { value: 'title-desc', label: 'Название: Я–А' },
  { value: 'calories-asc', label: 'Калорийность: по возрастанию' },
  { value: 'calories-desc', label: 'Калорийность: по убыванию' },
];

const titleSorter = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

export function sortNutritionCatalog(items, mode, calorieField) {
  if (!Array.isArray(items)) return [];
  if (mode === 'default' || !NUTRITION_SORT_OPTIONS.some(option => option.value === mode)) return items;
  const sorted = [...items];
  if (mode === 'title-asc' || mode === 'title-desc') {
    const direction = mode === 'title-desc' ? -1 : 1;
    sorted.sort((a,b) => direction * titleSorter.compare(a.title ?? '', b.title ?? ''));
  } else {
    const direction = mode === 'calories-desc' ? -1 : 1;
    sorted.sort((a,b) => {
      const av = Number(a[calorieField]);
      const bv = Number(b[calorieField]);
      const difference = (Number.isFinite(av) ? av : 0) - (Number.isFinite(bv) ? bv : 0);
      return direction * difference;
    });
  }
  return sorted;
}
