/**
 * Larger, openly licensed category photos for the supplement detail screen.
 * Source/creator/license information: docs/sportpit-image-credits.md.
 * The bundled 128px images remain offline thumbnails and onError fallbacks.
 */
const file = (name) => `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=960`;
export const SPORTPIT_HIRES_IMAGES = {
  protein: file('Container_of_Protein_Powder.jpg'),
  gainer: file('Sports_Nutrition_Supplements.jpg'),
  creatine: file('Creatine_monohydrate_supplement.jpg'),
  bcaa: file('Standard_Pr%C3%A4parate_von_BCAA_%28%2B_Vitamin_B6%29_2014-07-01_21-18.jpg'),
};
