import type { EvaluationReport } from '@pitchcoach/shared';

const KEY = 'pitchcoach:reports:v1';
const valid = (value: unknown): value is EvaluationReport =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as EvaluationReport).version === 1 &&
      typeof (value as EvaluationReport).id === 'string' &&
      Array.isArray((value as EvaluationReport).investors) &&
      Array.isArray((value as EvaluationReport).dimensions),
  );
let memoryReport: EvaluationReport | undefined;

export function readHistory(): EvaluationReport[] {
  try {
    const items = uni.getStorageSync(KEY);
    return Array.isArray(items) ? items.filter(valid).slice(0, 20) : [];
  } catch {
    return [];
  }
}
export function saveReport(report: EvaluationReport): boolean {
  memoryReport = report;
  try {
    uni.setStorageSync(
      KEY,
      [report, ...readHistory().filter((item) => item.id !== report.id)].slice(0, 20),
    );
    return true;
  } catch {
    return false;
  }
}
export function findReport(id: string) {
  return memoryReport?.id === id ? memoryReport : readHistory().find((item) => item.id === id);
}
export function clearHistory() {
  memoryReport = undefined;
  uni.removeStorageSync(KEY);
}
export function removeReport(id: string) {
  if (memoryReport?.id === id) memoryReport = undefined;
  uni.setStorageSync(
    KEY,
    readHistory().filter((item) => item.id !== id),
  );
}
export function openReport(report: EvaluationReport) {
  if (!saveReport(report)) uni.showToast({ title: '存储空间不足，报告仅本次可见', icon: 'none' });
  uni.navigateTo({ url: `/pages/report/index?id=${encodeURIComponent(report.id)}` });
}
