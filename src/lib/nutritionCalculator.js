/** Excel "Main" sheet (B2:B13, G2:G10): revised Harris-Benedict and kcal shares. */
export function calculateNutrition({ sex, height, weight, age, activityFactor, goal, adjustmentPercent = 0, proteinPercent = 25, fatPercent = 25, carbsPercent = 50 }) {
  const w = Number(weight);
  const h = Number(height);
  const a = Number(age);
  const factor = Number(activityFactor);
  const adjustment = Number(adjustmentPercent);
  const ratios = [Number(proteinPercent), Number(fatPercent), Number(carbsPercent)];
  if (!['male', 'female'].includes(sex) || !['cut', 'loss', 'maintain', 'gain'].includes(goal)) return null;
  if (![w, h, a, factor, adjustment, ...ratios].every(Number.isFinite) || w <= 0 || h <= 0 || a <= 0 || factor <= 0) return null;
  if (adjustment < 0 || (goal !== 'gain' && adjustment >= 100) || ratios.some((part) => part < 0 || part > 100)) return null;
  if (Math.abs(ratios.reduce((sum, value) => sum + value, 0) - 100) > 0.00001) return null;

  // Main!G2, G3: original coefficients and activity multipliers from Lists!C2:C6.
  const bmr = sex === 'male'
    ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * a
    : 447.593 + 9.247 * w + 3.098 * h - 4.33 * a;
  const maintenance = bmr * factor;
  // Main!G7: loss and cutting use B8, gain uses B9, maintenance is unchanged.
  const rawCalories = goal === 'gain'
    ? maintenance * (1 + adjustment / 100)
    : goal === 'cut' || goal === 'loss'
      ? maintenance * (1 - adjustment / 100)
      : maintenance;
  // Main!G8:G10: kcal portions / energy density (protein 4, fat 9, carbs 4).
  return {
    calories: Math.round(rawCalories),
    protein: Math.round(rawCalories * ratios[0] / 100 / 4),
    fat: Math.round(rawCalories * ratios[1] / 100 / 9),
    carbs: Math.round(rawCalories * ratios[2] / 100 / 4),
    bmr,
    maintenance,
    rawCalories,
  };
}
