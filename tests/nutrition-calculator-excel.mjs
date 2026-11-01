import assert from 'node:assert/strict';
import { calculateNutrition } from '../src/lib/nutritionCalculator.js';

function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} !== ${expected}`); }
const sample = calculateNutrition({ sex: 'male', weight: 78, height: 170, age: 22, activityFactor: 1.9, goal: 'maintain' });
close(sample.bmr, 1824.264);
close(sample.maintenance, 3466.1016);
close(sample.rawCalories, 3466.1016);
assert.deepEqual([sample.calories, sample.protein, sample.fat, sample.carbs], [3466, 217, 96, 433]);

const female = calculateNutrition({ sex: 'female', weight: 65, height: 167, age: 24, activityFactor: 1.55, goal: 'loss', adjustmentPercent: 20 });
close(female.bmr, 1462.094);
close(female.maintenance, 2266.2457);
close(female.rawCalories, 1812.99656);
assert.deepEqual([female.calories, female.protein, female.fat, female.carbs], [1813, 113, 50, 227]);

const gain = calculateNutrition({ sex: 'male', weight: 90, height: 185, age: 27, activityFactor: 1.55, goal: 'gain', adjustmentPercent: 10 });
close(gain.rawCalories, 3458.81074);

for (const factor of [1.2, 1.375, 1.55, 1.725, 1.9]) {
  const result = calculateNutrition({ sex: 'male', weight: 78, height: 170, age: 22, activityFactor: factor, goal: 'maintain' });
  close(result.maintenance, 1824.264 * factor);
}
const custom = calculateNutrition({ sex: 'male', weight: 78, height: 170, age: 22, activityFactor: 1.9, goal: 'gain', adjustmentPercent: 10, proteinPercent: 30, fatPercent: 30, carbsPercent: 40 });
close(custom.rawCalories, 3812.71176);
assert.deepEqual([custom.protein, custom.fat, custom.carbs], [286, 127, 381]);
assert.equal(calculateNutrition({ sex: 'male', weight: 78, height: 170, age: 22, activityFactor: 1.9, goal: 'maintain', proteinPercent: 35 }), null);
assert.equal(calculateNutrition({ sex: 'female', weight: 65, height: 167, age: 24, activityFactor: 1.55, goal: 'loss', adjustmentPercent: 100 }), null);
console.log('Excel nutrition-calculator reference cases passed.');
