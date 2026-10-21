import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { PreferenceId } from '@pitchcoach/shared';
import { usePitchWizard } from './pitch-wizard';

function setup() {
  const projectName = ref('');
  const description = ref('');
  const preferences = ref<PreferenceId[]>(['technology', 'growth', 'financial']);
  const attempted = ref(false);
  const onNavigate = vi.fn();
  const onInvalid = vi.fn();
  const wizard = usePitchWizard({ projectName, description, preferences, attempted, onNavigate, onInvalid });
  return { ...wizard, projectName, description, preferences, attempted, onNavigate, onInvalid };
}

describe('微信原生输入与七步向导', () => {
  it('输入后立即点下一步，使用原生表单中的最终中文项目名', () => {
    const wizard = setup();
    expect(wizard.projectName.value).toBe('');
    wizard.next({ detail: { value: { projectName: '星河协作' } } });
    expect(wizard.projectName.value).toBe('星河协作');
    expect(wizard.currentStep.value).toBe('about');
    expect(wizard.onNavigate).toHaveBeenCalledOnce();
    expect(wizard.onInvalid).not.toHaveBeenCalled();
  });
  it('键盘下一步同步确认值后推进，输入处理器不返回输入替换值', () => {
    const wizard = setup();
    expect(wizard.inputName({ detail: { value: '输入中的旧名' } })).toBeUndefined();
    wizard.confirmName({ detail: { value: '中文确认的最终名称' } });
    expect(wizard.projectName.value).toBe('中文确认的最终名称');
    expect(wizard.currentStep.value).toBe('about');
  });
  it('空名称或全空白停留原页，并显示可见错误', () => {
    for (const projectName of ['', '   ']) {
      const wizard = setup();
      wizard.next({ detail: { value: { projectName } } });
      expect(wizard.currentStep.value).toBe('name');
      expect(wizard.stepError.value).toBe('请填写项目名称');
      expect(wizard.onInvalid).toHaveBeenCalledWith('name');
    }
  });
  it('下一步只验证当前步骤，不因介绍或最终授权未填阻塞名称页', () => {
    const wizard = setup();
    wizard.projectName.value = '新项目';
    wizard.attempted.value = true;
    wizard.next();
    expect(wizard.currentStep.value).toBe('about');
    expect(wizard.description.value).toBe('');
  });
  it('介绍页从原生表单同步文本，满30字才允许继续', () => {
    const wizard = setup();
    wizard.goTo(1);
    wizard.next({ detail: { value: { description: '还没说清楚' } } });
    expect(wizard.currentStep.value).toBe('about');
    expect(wizard.stepError.value).toContain('30');
    wizard.next({ detail: { value: { description: '我们帮助小型企业管理真实客户与续费，按月收费，目前正在开展原型验证和客户访谈。' } } });
    expect(wizard.currentStep.value).toBe('industry');
    expect(wizard.stepError.value).toBe('');
  });
  it('三人阵容是必选项，缺员和重复都不能进入确认页', () => {
    const wizard = setup();
    wizard.goTo(5);
    for (const preferences of [['technology', 'growth'], ['technology', 'technology', 'growth']] as PreferenceId[][]) {
      wizard.preferences.value = preferences;
      wizard.next();
      expect(wizard.currentStep.value).toBe('panel');
      expect(wizard.stepError.value).not.toBe('');
      expect(wizard.onInvalid).toHaveBeenCalledWith('panel');
    }
    wizard.preferences.value = ['product', 'team', 'strategy'];
    wizard.next();
    expect(wizard.currentStep.value).toBe('confirm');
  });
  it('返回后保留输入和用户选择，并在修正后清除当前步骤错误', () => {
    const wizard = setup();
    wizard.next();
    wizard.inputName({ detail: { value: '保留的项目名称' } });
    wizard.next();
    wizard.back();
    expect(wizard.projectName.value).toBe('保留的项目名称');
    expect(wizard.stepError.value).toBe('');
    expect(wizard.preferences.value).toEqual(['technology', 'growth', 'financial']);
    expect(wizard.direction.value).toBe('back');
  });
});
