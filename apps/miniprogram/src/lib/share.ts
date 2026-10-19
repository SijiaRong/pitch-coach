import { sharePath } from './share-entry';
import { openPosterShare } from './share-flow';
import type { ImageShareBridge } from './share-flow';

declare const wx: { showShareImageMenu?: ImageShareBridge['showMenu'] };

export function sharePoster(path: string, context?: { industry?: unknown; round?: unknown }) {
  const bridge: ImageShareBridge = {
    preview: (url) => uni.previewImage({ urls: [url] }),
  };
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && typeof wx.showShareImageMenu === 'function')
    bridge.showMenu = (options) => wx.showShareImageMenu!(options);
  // #endif
  return openPosterShare(path, bridge, sharePath('poster', context));
}
