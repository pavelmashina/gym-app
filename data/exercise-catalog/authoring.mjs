// Compact authoring format. Every technique paragraph is authored per movement,
// not inferred from its name. Identity review is independent from content coverage.
export function authoredCard(key,name,en,classification,content) {
  const [family,group,muscles,equipment,pattern,mechanics,position,load,laterality='bilateral',measurement='weight_reps'] = classification.split('|');
  const [description,setup,step1,step2,step3,cue,mistake,limitation] = content;
  return {
    id:null,canonical_key:key,name_ru:name,status:'review',identity_status:'needs_review',
    family_code:family,muscle_group_code:group,primary_muscles:muscles.split(','),
    secondary_muscles:[],stabilizers:[],equipment_code:equipment,additional_equipment:[],
    movement_pattern_code:pattern,mechanics,body_position:position,laterality,difficulty:2,
    activity_type:measurement==='duration'?'isometric':'strength',measurement_type:measurement,
    load_mode:['machine','lever_machine'].includes(equipment)?'machine_indicated':load,
    aliases:[{alias:en,language:'en'}],short_description:description,setup_instructions:[setup],
    execution_steps:[step1,step2,step3],technique_cues:[cue],common_mistakes:[mistake],safety_notes:[limitation],
    measurement_note:load==='dumbbell_each'?'Вес одной гантели; не удваивать исторические значения.':
      load==='barbell_total'?'Общий вес штанги, включая гриф.':
      load==='assistance'?'Величина помощи и повторения; больше помощи не означает лучший результат.':
      measurement==='duration'?'Время удержания в секундах.':
      measurement==='bodyweight_reps'?'Повторения; дополнительный вес отдельно от массы тела.':
      measurement==='carry'?'Вес одного снаряда, дистанция и/или продолжительность.':
      'Указанный вес и повторения; для машины фиксировать экземпляр и способ нагрузки.',
    provenance:'user_spec_sections_6_8_original_editorial',media:[],
    identity_evidence:'Контент подготовлен по обязательному перечню. UUID и соответствие наследуемой записи требуют отдельной проверки; автоматического слияния нет.',
  };
}
