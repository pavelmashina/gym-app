import { referenceCards } from './reference-cards.mjs';
import { basicBatch2 } from './basic-batch-2.mjs';
import { machineCards } from './machine-cards.mjs';
import { remainingLegs } from './remaining-legs.mjs';
import { remainingUpper } from './remaining-upper.mjs';
import { remainingCore } from './remaining-core.mjs';
export const catalogDrafts = [...referenceCards,...basicBatch2,...remainingLegs,...remainingUpper,...remainingCore,...machineCards];
