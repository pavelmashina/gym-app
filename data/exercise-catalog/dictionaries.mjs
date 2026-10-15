export const muscleGroups = {abs:'Пресс',back:'Спина',biceps:'Бицепс',calves:'Икры',chest:'Грудь',full_body:'Всё тело',glutes:'Ягодицы',legs:'Ноги',shoulders:'Плечи',triceps:'Трицепс'};
export const families = {
  burpees:'Бёрпи',calf_raises:'Подъёмы на носки',carries:'Перенос веса',chest_flyes:'Сведения и разведения рук',
  chest_presses:'Жимы от груди',core_stability:'Стабилизация корпуса',deadlifts:'Становые тяги',elbow_curls:'Сгибания рук',
  elbow_extensions:'Разгибания рук',hanging_leg_raises:'Подъёмы ног в висе',hip_abductions:'Отведения бедра',hip_adductions:'Приведения бедра',
  hip_extensions:'Разгибание таза',horizontal_rows:'Горизонтальные тяги',knee_curls:'Сгибания ног',knee_extensions:'Разгибания ног',
  leg_presses:'Жимы ногами',lunges:'Выпады и сплит-приседания',overhead_presses:'Вертикальные жимы',pull_ups:'Подтягивания',
  push_ups:'Отжимания',rear_delt_flyes:'Разведения на заднюю часть плеча',shoulder_raises:'Подъёмы рук',shrugs:'Подъёмы плеч',
  squats:'Приседания',step_ups:'Зашагивания',trunk_flexions:'Сгибания корпуса',vertical_pulls:'Вертикальные тяги',
};
export const patterns = {
  carry:'Перенос веса',core_stability:'Антиротация и стабилизация корпуса',elbow_extension:'Разгибание локтя',elbow_flexion:'Сгибание локтя',
  hip_abduction:'Отведение бедра',hip_adduction:'Приведение бедра',hip_extension:'Разгибание таза',hip_flexion:'Сгибание бедра',
  hip_hinge:'Тазовый наклон',horizontal_abduction:'Горизонтальное отведение плеча',horizontal_adduction:'Горизонтальное приведение плеча',
  horizontal_pull:'Горизонтальная тяга',horizontal_push:'Горизонтальный жим',knee_extension:'Разгибание колена',knee_flexion:'Сгибание колена',
  lunge:'Выпад',mixed:'Смешанное движение',plantar_flexion:'Подошвенное сгибание стопы',scapular_elevation:'Подъём лопаток',
  shoulder_abduction:'Отведение плеча',shoulder_flexion:'Сгибание плеча',squat:'Приседание',trunk_flexion:'Сгибание корпуса',
  trunk_rotation:'Поворот корпуса',vertical_pull:'Вертикальная тяга',vertical_push:'Вертикальный жим',
};
// [Russian label, legacy UI group]. Auxiliary equipment need not own a filter.
export const equipment = {
  ab_wheel:['Ролик для пресса','Свой вес'],assisted_machine:['Гравитрон','Гравитрон'],
  back_extension_bench:['Скамья для гиперэкстензии','Тренажёр'],barbell:['Штанга','Штанга'],
  bodyweight:['Собственный вес','Свой вес'],cable:['Блочный тренажёр','Тренажёр'],crossover:['Кроссовер','Тренажёр'],
  dumbbell:['Гантели','Гантели'],ez_bar:['EZ-гриф','Штанга'],hack:['Гакк-тренажёр','Гакк'],kettlebell:['Гири','Гири'],
  lever_machine:['Рычажный тренажёр','Тренажёр'],machine:['Тренажёр','Тренажёр'],parallel_bars:['Брусья','Свой вес'],
  pull_up_bar:['Перекладина','Турник'],sled:['Салазковый тренажёр','Тренажёр'],smith:['Тренажёр Смита','Смит'],
  t_bar:['Т-гриф','Тренажёр'],bench:['Скамья',null],rack:['Силовая рама',null],platform:['Платформа',null],
  bands:['Резиновые петли и эспандеры',null],other:['Другое',null],
};
export const muscles = {
  abdominals:['Мышцы живота','abs'],anterior_deltoid:['Передняя часть дельтовидной мышцы','shoulders'],
  biceps:['Двуглавая мышца плеча','biceps'],brachialis:['Плечевая мышца','biceps'],brachioradialis:['Плечелучевая мышца','biceps'],
  forearm_flexors:['Сгибатели предплечья','full_body'],gastrocnemius:['Икроножная мышца','calves'],
  gluteus_maximus:['Большая ягодичная мышца','glutes'],gluteus_medius:['Средняя ягодичная мышца','glutes'],
  gluteus_minimus:['Малая ягодичная мышца','glutes'],hamstrings:['Задняя группа мышц бедра','legs'],
  hip_adductors:['Приводящие мышцы бедра','legs'],hip_flexors:['Сгибатели бедра','legs'],latissimus_dorsi:['Широчайшая мышца спины','back'],
  middle_deltoid:['Средняя часть дельтовидной мышцы','shoulders'],obliques:['Косые мышцы живота','abs'],
  pectoralis_major:['Большая грудная мышца','chest'],posterior_deltoid:['Задняя часть дельтовидной мышцы','shoulders'],
  quadriceps:['Четырёхглавая мышца бедра','legs'],rectus_abdominis:['Прямая мышца живота','abs'],
  rhomboids:['Ромбовидные мышцы','back'],soleus:['Камбаловидная мышца','calves'],spinal_erectors:['Разгибатели позвоночника','back'],
  triceps:['Трёхглавая мышца плеча','triceps'],upper_trapezius:['Верхняя часть трапециевидной мышцы','back'],
};
export const additionalEquipment = {
  dumbbell_goblet_squat:[],smith_squat:[],dumbbell_bulgarian_split_squat:['bench'],dumbbell_step_up:['platform'],
  seated_dumbbell_calf_raise:['bench'],dumbbell_bench_press:['bench'],close_grip_barbell_bench_press:['bench','rack'],
  incline_barbell_bench_press:['bench','rack'],incline_dumbbell_bench_press:['bench'],decline_dumbbell_bench_press:['bench'],
  flat_dumbbell_fly:['bench'],incline_dumbbell_fly:['bench'],elevated_push_up:['platform'],single_arm_dumbbell_row:['bench'],
  seated_dumbbell_overhead_press:['bench'],seated_arnold_press:['bench'],concentration_dumbbell_curl:['bench'],
  ez_bar_preacher_curl:['bench'],lying_barbell_triceps_extension:['bench'],lying_ez_triceps_extension:['bench'],
  seated_two_hand_overhead_extension:['bench'],
};
export const extraAliases = {
  dumbbell_goblet_squat:['Гоблет-приседания','Приседания гоблет'],
  lying_barbell_triceps_extension:['Французский жим лёжа с прямым грифом','Straight Bar Skull Crusher'],
  lying_ez_triceps_extension:['Французский жим лёжа с EZ-грифом','Французский жим с EZ-грифом','EZ Skull Crusher'],
  lat_pulldown:['Вертикальная тяга блока'],floor_push_up:['Отжимания от пола'],
};
