import { describe, expect, it } from 'vitest';
import { friendShareMessage, timelineShareMessage, parseShareEntry, sharePath, shareQuery } from './share-entry';
describe('跨设备分享入口的严格白名单', () => {
  it('只输出首页和合法来源/行业/轮次，绝不复制报告字段', () => {
    const privateReport = { from: 'friend', industry: 'ai', round: 'angel', id: 'secret', projectName: 'private', description: 'bp text', bpText: 'private', score: 99, preferences: ['financial'], userId: 'owner' };
    expect(parseShareEntry(privateReport)).toEqual({ from: 'friend', industry: 'ai', round: 'angel' });
    expect(sharePath('friend', privateReport)).toBe('/pages/index/index?from=friend&industry=ai&round=angel');
  });
  it('非字符串来源、注入字段和无效枚举全部忽略', () => {
    for (const from of [['friend'], { toString: () => 'friend' }, 'friend&name=secret', null, 1])
      expect(parseShareEntry({ from, industry: 'ai&name=secret', round: ['angel'] })).toEqual({});
    expect(shareQuery('timeline', { industry: 'invalid', round: 'angel' })).toBe('from=timeline&round=angel');
    expect(sharePath('poster')).toBe('/pages/index/index?from=poster');
  });
  it('好友与朋友圈都使用静态品牌封面，避免微信默认截图泄露报告', () => {
    const privateReport = { industry: 'ai', round: 'angel', projectName: '私密客户', score: 99, headline: '私密摘要', imageUrl: 'wxfile://private-poster.png' };
    const friend = friendShareMessage(privateReport);
    const timeline = timelineShareMessage(privateReport);
    for (const message of [friend, timeline]) {
      expect(message.imageUrl).toBe('/static/brand/ai-toulema.png');
      expect(JSON.stringify(message)).not.toMatch(/私密客户|私密摘要|99|private-poster/);
    }
    expect(friend.path).toBe('/pages/index/index?from=friend&industry=ai&round=angel');
    expect(timeline.query).toBe('from=timeline&industry=ai&round=angel');
  });
});
