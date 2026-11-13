// Existing string options and authored option objects share the same contract:
// {label, description?, video_url?, video_path?}, without new exercise IDs.
function toOption(raw) {
  if (typeof raw === 'string') return { label:raw.trim() };
  if (!raw || typeof raw !== 'object') return { label:'' };
  return { ...raw, label:String(raw.label ?? raw.value ?? raw.name ?? '').trim() };
}

export function normalizedVariationAxes(exercise) {
  return (Array.isArray(exercise?.variation_axes) ? exercise.variation_axes : [])
    .filter(axis => axis && typeof axis.label === 'string' && Array.isArray(axis.options))
    .map(axis => ({ label:axis.label, options:axis.options.map(toOption).filter(o => o.label) }))
    .filter(axis => axis.options.length > 0);
}

export function defaultVariationSelection(exercise) {
  return normalizedVariationAxes(exercise).map(axis => axis.options[0].label);
}

export function variationPresentation(exercise, selection) {
  const axes = normalizedVariationAxes(exercise);
  const chosen = axes.map((axis, i) => axis.options.find(o => o.label === selection?.[i]) || axis.options[0]);
  const changed = chosen.some((option, i) => option !== axes[i].options[0]);
  const override = chosen.filter(option => option.resolvedVideoUrl || option.video_url).at(-1);
  const video = override ? (override.resolvedVideoUrl || override.video_url)
    : changed ? null : (exercise?.resolvedVideoUrl || exercise?.video_url || null);
  const notes = chosen.map(option => String(option.description || '').trim()).filter(Boolean);
  return {
    axes,
    selection:chosen.map(o => o.label),
    summary:axes.map((axis, i) => axis.label + ' — ' + chosen[i].label).join('; '),
    notes:[...new Set(notes)].join('\n\n'),
    hasVariation:axes.length > 0,
    isAlternate:changed,
    video,
    missingVideo:Boolean(changed && !video),
  };
}

// A private video can be signed at either catalog load or session-detail load.
// Unmodified strings are left as strings for the old imported sheet.
export async function signVariationMedia(axes, signVideoPath) {
  if (!Array.isArray(axes)) return axes;
  return Promise.all(axes.map(async axis => {
    if (!Array.isArray(axis?.options)) return axis;
    const options = await Promise.all(axis.options.map(async option => {
      if (!option || typeof option !== 'object' || !option.video_path) return option;
      const resolvedVideoUrl = await signVideoPath(option.video_path);
      return { ...option, resolvedVideoUrl };
    }));
    return { ...axis, options };
  }));
}
