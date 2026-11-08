import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATEGORY_OPTIONS,PLACE_OPTIONS,EQUIPMENT_OPTIONS,LEVEL_OPTIONS,PROGRAM_DETAIL_FIELDS,normalizeProgramDetails,normalizeProgramCategories,normalizeProgramLevel,programLevelIndex} from '../src/lib/programOptions.js';
const read=p=>readFileSync(p,'utf8');
assert.deepEqual(CATEGORY_OPTIONS,['Силовой','Функционал','Растяжка','Кардио','Свой вес']);
assert.deepEqual(normalizeProgramCategories(['Силовые','Функциональный тренинг','С собственным весом','Домашние тренировки','Кардио','Кардио']),['Силовой','Функционал','Кардио','Свой вес']);
assert.deepEqual(normalizeProgramCategories(['Силовой','Растяжка']),['Силовой','Растяжка']);
assert.deepEqual(PLACE_OPTIONS,['Тренажерный зал','Дом','Улица','Другое','Свой вариант']);
assert.deepEqual(EQUIPMENT_OPTIONS,['Свободные веса','Тренажеры','Без оборудования','Полный зал','Свой вариант']);
assert.deepEqual(LEVEL_OPTIONS,['Новичок','Средний','Уверенный','Продвинутый','Эксперт']);
assert.equal(normalizeProgramLevel('Начальный'),'Новичок');
assert.equal(normalizeProgramLevel('Начинающий'),'Новичок');
assert.equal(normalizeProgramLevel('Продвинутый'),'Продвинутый');
assert.equal(programLevelIndex('Эксперт'),5);
assert.equal(programLevelIndex('Начальный'),1);
assert.equal(PROGRAM_DETAIL_FIELDS.length,9);
assert.deepEqual(normalizeProgramDetails({goal:'Набор мышечной массы',frequency:'',duration:'8 недель',arbitrary:'foo'}),{goal:'Набор мышечной массы',duration:'8 недель'});
const form=read('src/components/CreateProgramScreen.jsx');
const program=read('src/lib/programs.js');
const detail=read('src/components/ProgramDetailScreen.jsx');
const shared=read('src/components/ProgramOverview.jsx');
const draft=read('src/lib/programDraft.js');
for(const token of ['CATEGORY_OPTIONS.map','PLACE_OPTIONS','EQUIPMENT_OPTIONS','LEVEL_OPTIONS',"PROGRAM_DETAIL_FIELDS.filter(field => ['duration', 'frequency'].includes(field.key))"]) assert.ok(form.includes(token),token);
assert.doesNotMatch(form, /<span>Шаг 1<\/span>|<h1>Новая программа<\/h1>|Заполните информацию о программе|<span>Обложка<\/span>|<span>Тип тренировок<\/span>|<span>Дополнительно<\/span>/);
assert.match(form,/choice === 'Свой вариант'/);
assert.match(form,/program-select-custom-input/);
assert.match(form,/setCustomSelected\(true\)/);
assert.match(form,/value=\{value \|\| ''\}/);
const creatorCss = read('src/create-program.css');
assert.match(form,/h2>Дополнительно<\/h2>/);
assert.doesNotMatch(form,/h2>Характеристики программы<\/h2>/);
assert.equal((form.match(/className="program-select-card"/g) || []).length,1,'All program selectors share one card on step one');
assert.ok(form.indexOf('label="Место тренировок"') < form.indexOf("PROGRAM_DETAIL_FIELDS.filter(field => ['duration', 'frequency'].includes(field.key))"), 'Duration and frequency follow place in the same card');
assert.match(creatorCss,/\.create-program-step1-phone \.create-program-form-card \.program-field \.program-auto-textarea:focus-visible/);
assert.match(creatorCss,/border-radius: 0 !important/);
assert.match(creatorCss,/\.create-program-step1-phone \.program-select-control select:focus-visible/);
assert.match(creatorCss,/font-size: var\(--text-micro\) !important/);
assert.match(form,/useLayoutEffect\(\(\) => \{/);
assert.match(form,/resizeTextArea\(descriptionInputRef\.current\)/);
assert.match(form,/ref=\{descriptionInputRef\}/);
assert.match(form,/className="program-auto-textarea program-description-textarea"/);
assert.match(creatorCss,/\.create-program-step1-phone \.create-program-form-card \.program-description-textarea/);
assert.match(creatorCss,/text-align: justify !important/);
assert.match(form,/<ProgramCoverCropEditor imageUrl=\{coverCropSource\.url\}/);
assert.doesNotMatch(form,/program-cover-edit-framing/);
assert.match(form,/className="program-cover-pencil"/);
assert.match(form,/aria-label="Управление обложкой"/);
assert.match(form,/aria-expanded=\{coverMenuOpen\}/);
assert.match(form,/role="menu" aria-label="Действия с обложкой"/);
for(const item of ['Изменить фрагмент', 'Выбрать другое фото', 'Удалить фото']) assert.ok(form.includes(item),item);
assert.match(form,/className="program-cover has-image"/);
assert.match(form,/className="program-cover program-cover-empty"/);
assert.match(form,/coverPickerRef\.current\?\.click\(\)/);
assert.match(form,/setCoverRemoved\(Boolean\(existingCoverPath\)\)/);
assert.match(form,/removeCover: coverRemoved/);
assert.match(program,/else if \(removeCover && existingCoverPath\)/);
assert.match(program,/cover_path: null/);
assert.match(form,/setCoverCropSource\(\{ url: URL\.createObjectURL\(file\), createdUrl: true \}\)/);
const cropper = read('src/components/ProgramCoverCropEditor.jsx');
assert.match(cropper,/onPointerDown=\{startDrag\}/);
assert.match(cropper,/onPointerMove=\{moveDrag\}/);
assert.match(cropper,/max=\{MAX_ZOOM\}/);
assert.match(cropper,/OUTPUT_WIDTH = 1200/);
assert.match(cropper,/OUTPUT_HEIGHT = 675/);
assert.match(cropper,/canvas\.toBlob\(resolve, 'image\/webp'/);
assert.match(cropper,/onApply\(file\)/);
const cropCss = read('src/program-cover-crop.css');
assert.match(cropCss,/aspect-ratio: 16 \/ 9/);
assert.match(cropCss,/touch-action: none/);
assert.match(creatorCss,/\.create-program-step1-phone \.create-program-form-card \.program-field:first-child/);
assert.match(creatorCss,/\.create-program-step1-phone \.program-select-row/);
assert.match(creatorCss,/\.create-program-step1-phone \.program-cover-actions/);
assert.match(creatorCss,/\.create-program-step1-phone \.program-cover-pencil/);
assert.match(creatorCss,/\.create-program-step1-phone \.program-cover-action-menu/);
const fontRules = [
  ['header', /\.create-program-step1-phone \.create-program-header > strong \{[\s\S]*?font-size: 20px !important/],
  ['section titles', /\.create-program-step1-phone \.create-program-section-head h2 \{[\s\S]*?font-size: 20px !important/],
  ['input labels', /\.create-program-step1-phone \.create-program-form-card \.program-field > span \{[\s\S]*?font-size: 16px !important/],
  ['input fields', /\.create-program-step1-phone \.create-program-form-card \.program-field \.program-auto-textarea:focus-visible \{[\s\S]*?font-size: 14px !important/],
  ['categories', /\.create-program-step1-phone \.program-category-list button \{[\s\S]*?font-size: 12px !important/],
  ['select labels', /\.create-program-step1-phone \.program-select-row-label \{[\s\S]*?font-size: 14px !important/],
  ['select values', /\.create-program-step1-phone \.program-select-control select option \{[\s\S]*?font-size: 12px !important/],
  ['cover captions', /\.create-program-step1-phone \.create-program-section-head small \{[\s\S]*?font-size: 12px !important/],
  ['next button', /\.create-program-step1-phone \.create-program-next \{[\s\S]*?font-size: 14px !important/],
];
for(const [label,re] of fontRules) assert.match(creatorCss,re,label);
assert.match(form,/setDetails\(launchOnly \? joinDetails : program\.details \?\? \{\}\)/);
assert.match(program,/saveProgramDetails/);
assert.match(program,/\.update\(\{details:normalizeProgramDetails\(details\)\}\)/);
assert.equal(program.match(/await saveProgramDetails\(/g).length,2);
assert.equal(program.match(/level, details, schedule_mode/g).length,3);
assert.match(draft,/draft\.details/);
assert.doesNotMatch(detail,/<ProgramOverviewFacts/);
assert.match(shared,/details\.duration/);
assert.match(shared,/details\.frequency/);
assert.doesNotMatch(shared,/details\.goal/);
console.log('Canonical selectable program details, persistence and draft restoration verified.');
