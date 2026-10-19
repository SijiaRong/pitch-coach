import { sharePath } from './share-entry';
export type ImageShareResult = 'opened' | 'cancelled' | 'preview';
export interface ImageShareBridge {
  showMenu?: (options: {
    path: string;
    needShowEntrance: boolean;
    entrancePath: string;
    success: () => void;
    fail: (error: { errMsg?: string }) => void;
  }) => void;
  preview: (path: string) => void;
}

/** Opening the menu is not proof of publication. Cancelling never saves or retries. */
export async function openPosterShare(
  path: string,
  bridge: ImageShareBridge,
  entrancePath = sharePath('poster'),
): Promise<ImageShareResult> {
  if (!path) throw new Error('请先生成海报');
  if (bridge.showMenu) {
    const result = await new Promise<ImageShareResult | 'unsupported'>((resolve) => {
      try {
        bridge.showMenu!({
          path,
          needShowEntrance: true,
          entrancePath,
          success: () => resolve('opened'),
          fail: (error) =>
            resolve(/cancel/i.test(error.errMsg || '') ? 'cancelled' : 'unsupported'),
        });
      } catch {
        resolve('unsupported');
      }
    });
    if (result !== 'unsupported') return result;
  }
  bridge.preview(path);
  return 'preview';
}
