import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import { panelPreferencesSchema, submissionSchema } from '@pitchcoach/shared';
import type { PreferenceId } from '@pitchcoach/shared';

export const PITCH_STEPS = ['name', 'about', 'industry', 'round', 'stage', 'panel', 'confirm'] as const;
type StepId = (typeof PITCH_STEPS)[number];

function nativeValue(event: unknown): unknown {
  return event && typeof event === 'object' && 'detail' in event
    ? (event.detail as { value?: unknown } | undefined)?.value : undefined;
}

export function usePitchWizard(options: {
  projectName: Ref<string>; description: Ref<string>; preferences: Ref<PreferenceId[]>;
  attempted: Ref<boolean>; startAt?: number;
  onNavigate?: () => void; onInvalid?: (step: StepId) => void; onEdit?: () => void;
}) {
  const step = ref(options.startAt ?? 0);
  const direction = ref<'forward' | 'back'>('forward');
  const stepTried = ref(false);
  const currentStep = computed(() => PITCH_STEPS[step.value]);
  const progress = computed(() => (step.value + 1) / PITCH_STEPS.length);
  const error = computed(() => {
    const result = currentStep.value === 'name'
      ? submissionSchema.shape.projectName.safeParse(options.projectName.value)
      : currentStep.value === 'about'
        ? submissionSchema.shape.description.safeParse(options.description.value)
        : currentStep.value === 'panel' ? panelPreferencesSchema.safeParse(options.preferences.value) : undefined;
    return result && !result.success ? result.error.issues[0].message : '';
  });
  const stepError = computed(() => stepTried.value || options.attempted.value ? error.value : '');
  function goTo(index: number) {
    const target = Math.max(0, Math.min(PITCH_STEPS.length - 1, index));
    if (target === step.value) return;
    direction.value = target > step.value ? 'forward' : 'back';
    step.value = target;
    stepTried.value = false;
    options.onNavigate?.();
  }
  function inputName(event: unknown) {
    const value = nativeValue(event);
    if (typeof value === 'string') { options.projectName.value = value; options.onEdit?.(); }
  }
  function inputDescription(event: unknown) {
    const value = nativeValue(event);
    if (typeof value === 'string') { options.description.value = value; options.onEdit?.(); }
  }
  function next(event?: unknown) {
    // Native form values include the last Chinese IME edit even before v-model/blur settles.
    const value = nativeValue(event);
    if (value && typeof value === 'object') {
      const fields = value as Record<string, unknown>;
      if (currentStep.value === 'name' && typeof fields.projectName === 'string')
        options.projectName.value = fields.projectName;
      if (currentStep.value === 'about' && typeof fields.description === 'string')
        options.description.value = fields.description;
      options.onEdit?.();
    }
    if (error.value) { stepTried.value = true; options.onInvalid?.(currentStep.value); return; }
    goTo(step.value + 1);
  }
  function confirmName(event: unknown) { inputName(event); next(); }
  function back() { goTo(step.value - 1); }
  return { step, currentStep, progress, direction, stepTried, stepError, goTo, next, back,
    inputName, inputDescription, confirmName };
}
