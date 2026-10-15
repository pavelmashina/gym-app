// Generic compatibility options, not inferred properties of a user's machine.
// The user must choose the actual loading mechanism when registering equipment.
export const machineProfiles = {
  selectorized: ['Блочный тренажёр со стеком','selectorized','stack'],
  plate_lever: ['Рычажный тренажёр с дисками','plate_loaded_lever','plates'],
  stack_lever: ['Рычажный тренажёр со стеком','stack_loaded_lever','stack'],
  guided_plates: ['Направляемая каретка или гриф с дисками','guided_sled','plates'],
  cable_stack: ['Тросовый блок со стеком','cable','stack'],
  assisted: ['Тренажёр с противовесом','assisted','assistance'],
  bodyweight_support: ['Опора для упражнения с весом тела','specialized','bodyweight'],
  landmine: ['Шарнирная опора Т-грифа с дисками','specialized','plates'],
};
export const compatibleProfiles = {
  machine: ['selectorized','plate_lever','stack_lever'],
  lever_machine: ['plate_lever','stack_lever'],
  sled: ['guided_plates'], hack: ['guided_plates'], smith: ['guided_plates'],
  cable: ['cable_stack'], crossover: ['cable_stack'],
  assisted_machine: ['assisted'], back_extension_bench: ['bodyweight_support'],
  t_bar:['landmine'],
};
