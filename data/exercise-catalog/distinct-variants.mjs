// Explicit editorial decisions, not a global allow-list for every future family member.
export const distinctVariants = [
  [['barbell_back_squat','barbell_front_squat'],'Гриф на спине и перед корпусом; различаются исходное положение и техника.'],
  [['barbell_bench_press','close_grip_barbell_bench_press'],'Обычный и узкий хват отдельно предусмотрены обязательным перечнем.'],
  [['floor_push_up','close_hand_push_up'],'Обычная и узкая постановка рук отдельно предусмотрены обязательным перечнем.'],
  [['pronated_pull_up','supinated_chin_up','neutral_grip_pull_up'],'Прямой, обратный и нейтральный хват; не сводить в один результат без сохранения варианта.'],
  [['barbell_romanian_deadlift','conventional_barbell_deadlift','sumo_barbell_deadlift'],'Румынская тяга, классическая тяга с пола и сумо имеют разные исходные положения и выполнение.'],
  [['stationary_dumbbell_lunge','reverse_dumbbell_lunge','dumbbell_bulgarian_split_squat'],'Шаг вперёд с возвратом, шаг назад и задняя нога на опоре — разные варианты.'],
  [['incline_dumbbell_bench_press','decline_dumbbell_bench_press'],'Противоположное направление наклона скамьи: головой вверх и вниз.'],
  [['seated_dumbbell_overhead_press','seated_arnold_press'],'У жима Арнольда отдельно описан разворот рук; обычный жим его не включает.'],
  [['standing_dumbbell_curl','dumbbell_hammer_curl'],'Ладони вверх и нейтральный хват отдельно заданы в карточках.'],
  [['floor_crunch','reverse_floor_crunch','floor_sit_up'],'Подъём лопаток, подкручивание таза и полный подъём туловища — разные действия.'],
  [['hanging_knee_raise','hanging_straight_leg_raise'],'Подъём согнутых и прямых ног; не удалять различие длины рычага.'],
  [['burpee_without_push_up','burpee_with_push_up'],'Отжимание либо отсутствует, либо входит в повторение.'],
  [['straight_bar_pushdown','rope_pushdown'],'Прямая и канатная рукояти отдельно обязательны по ТЗ; варианты не объявляются дублями по одному паттерну.'],
];
