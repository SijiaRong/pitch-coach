export const INDUSTRY_IDS = [
  'ai',
  'saas',
  'consumer',
  'hardware',
  'health',
  'climate',
  'fintech',
  'other',
] as const;
export type IndustryId = (typeof INDUSTRY_IDS)[number];
export const DIMENSION_IDS = [
  'problem',
  'market',
  'product',
  'moat',
  'traction',
  'business',
  'team',
  'funding',
] as const;
export type DimensionId = (typeof DIMENSION_IDS)[number];
export type Tone = 'sharp' | 'balanced';
export type Vote = 'invest' | 'watch' | 'pass' | 'insufficient';
export const ROUND_IDS = ['seed', 'angel', 'pre-a', 'a', 'b', 'growth'] as const;
export type RoundId = (typeof ROUND_IDS)[number];

export interface FundingRound {
  id: RoundId;
  name: string;
  coach: string;
  question: string;
  focus: string;
  multipliers: Record<DimensionId, number>;
}

export const FUNDING_ROUNDS: FundingRound[] = [
  {
    id: 'seed',
    name: '种子轮',
    coach: 'seed-coach',
    question: '这个问题，值得你做三年吗？',
    focus:
      '重点看创始人与问题的匹配、客户访谈、问题真实性、原型和最小验证。不因没有收入就否定项目；追问下一笔小额资金如何验证最危险的假设。',
    multipliers: {
      problem: 1.6,
      market: 0.8,
      product: 1.2,
      moat: 0.7,
      traction: 0.7,
      business: 0.6,
      team: 1.8,
      funding: 1,
    },
  },
  {
    id: 'angel',
    name: '天使轮',
    coach: 'angel-coach',
    question: '有人需要，也有人愿意付出代价吗？',
    focus:
      '重点看团队执行、早期产品、真实需求与最初用户反馈，允许规模很小、收入很早期。用付费或明确行为验证意愿，要求合理的试验预算与下一阶段里程碑。',
    multipliers: {
      problem: 1.3,
      market: 0.9,
      product: 1.2,
      moat: 0.8,
      traction: 1,
      business: 0.8,
      team: 1.4,
      funding: 1,
    },
  },
  {
    id: 'pre-a',
    name: 'Pre-A 轮',
    coach: 'growth-partner',
    question: '最早的好结果，能再发生一次吗？',
    focus:
      '重点看产品市场匹配信号、分群留存、初步付费、单位经济假设和渠道试验。区分偶发大客户、补贴增长和可重复的客户获取。',
    multipliers: {
      problem: 1,
      market: 1,
      product: 1.1,
      moat: 0.9,
      traction: 1.5,
      business: 1.3,
      team: 1,
      funding: 1,
    },
  },
  {
    id: 'a',
    name: 'A 轮',
    coach: 'scale-coach',
    question: '增长靠创始人，还是靠一套系统？',
    focus:
      '重点看增长可复制性、客户留存和收入质量、可扩展的销售交付、竞争优势与组织能力。追问扩张后获客和交付成本是否恶化、资金是否支持可检验的规模目标。',
    multipliers: {
      problem: 0.8,
      market: 1.2,
      product: 0.9,
      moat: 1.1,
      traction: 1.5,
      business: 1.4,
      team: 1,
      funding: 1.2,
    },
  },
  {
    id: 'b',
    name: 'B 轮',
    coach: 'efficiency-coach',
    question: '规模变大了，生意变好了吗？',
    focus:
      '重点看规模下的经营效率、现金流、利润路径、市场份额、客户集中度、管理梯队和竞争韧性。拆解增长与资金效率，要求完整的历史财务和情景预算。',
    multipliers: {
      problem: 0.6,
      market: 1.2,
      product: 0.8,
      moat: 1.4,
      traction: 1.2,
      business: 1.8,
      team: 1.2,
      funding: 1.4,
    },
  },
  {
    id: 'growth',
    name: 'C 轮及以后',
    coach: 'late-coach',
    question: '脱离下一轮融资，还能站得稳吗？',
    focus:
      '重点看现金流与盈利质量、治理与业务风险、资本效率、行业地位和合理退出路径。要求完整财务及治理证据，不凭融资轮次推断估值、上市资格或退出承诺。',
    multipliers: {
      problem: 0.5,
      market: 1.2,
      product: 0.7,
      moat: 1.5,
      traction: 1,
      business: 2,
      team: 1.3,
      funding: 1.8,
    },
  },
];

export const DIMENSIONS: { id: DimensionId; name: string; question: string }[] = [
  { id: 'problem', name: '痛点强度', question: '谁在什么场景下，愿意为这个问题付钱？' },
  { id: 'market', name: '市场空间', question: '可触达的细分市场有多大，依据是什么？' },
  { id: 'product', name: '产品价值', question: '比现有替代方案好在哪里，有验证吗？' },
  { id: 'moat', name: '竞争壁垒', question: '如果大厂明天跟进，凭什么留住客户？' },
  { id: 'traction', name: '增长验证', question: '留存、付费、复购是事实，还是预测？' },
  { id: 'business', name: '商业模式', question: '单个客户的收入，能否覆盖获客与交付？' },
  { id: 'team', name: '团队适配', question: '为什么是这个团队来做，有哪些相关战绩？' },
  { id: 'funding', name: '融资逻辑', question: '这笔钱换来什么可检验的里程碑？' },
];

export interface Investor {
  id: string;
  name: string;
  title: string;
  mark: string;
  color: string;
  style: string;
  focus: string;
  opening: string;
}

export const INVESTORS: Record<string, Investor> = {
  'ai-partner': {
    id: 'ai-partner',
    name: '沈砚',
    title: 'AI 技术派',
    mark: 'S',
    color: 'violet',
    style: '冷静拆解技术含金量，反感把 API 包装成技术壁垒。',
    focus: '数据飞轮、模型依赖、推理成本、工作流黏性、客户真实效率收益。',
    opening: '接了大模型，不代表接住了生意。',
  },
  'saas-partner': {
    id: 'saas-partner',
    name: '江澄',
    title: 'SaaS 长期派',
    mark: 'J',
    color: 'blue',
    style: '用续费率和回本周期说话，拒绝把定制项目当订阅收入。',
    focus: 'ARR / MRR、净收入留存、销售周期、交付成本、客户集中度。',
    opening: '合同签下来的那天，生意才刚开始。',
  },
  'consumer-partner': {
    id: 'consumer-partner',
    name: '许知微',
    title: '消费品牌派',
    mark: 'X',
    color: 'orange',
    style: '相信用户行为，不相信创始人自我感动。',
    focus: '自然复购、渠道效率、品类心智、贡献毛利、库存周转。',
    opening: '朋友圈都说好，收银台有没有人排队？',
  },
  'hardware-partner': {
    id: 'hardware-partner',
    name: '陈铸',
    title: '硬科技实干派',
    mark: 'C',
    color: 'teal',
    style: '尊重工程难度，但要求量产和现金流证据。',
    focus: '技术成熟度、BOM、良率、供应链、认证、交付周期。',
    opening: '发布会上的原型机，还不是流水线上的产品。',
  },
  'health-partner': {
    id: 'health-partner',
    name: '林知远',
    title: '医疗审慎派',
    mark: 'L',
    color: 'teal',
    style: '严谨审慎，区分研究结果、临床证据和商业准入。',
    focus: '临床有效性、注册路径、伦理与数据合规、支付方、准入周期。',
    opening: '论文能证明可能性，临床才回答可用性。',
  },
  'climate-partner': {
    id: 'climate-partner',
    name: '方循',
    title: '绿色产业派',
    mark: 'F',
    color: 'green',
    style: '从产业现场看项目，追问去掉补贴是否成立。',
    focus: '度电 / 单位成本、验证周期、资本开支、客户采购、政策依赖。',
    opening: '愿景可以很绿，现金流不能一直是红的。',
  },
  'fintech-partner': {
    id: 'fintech-partner',
    name: '陆衡',
    title: '金融风控派',
    mark: 'L',
    color: 'blue',
    style: '先审风险和业务边界，再看增长。不能用监管套利充当优势。',
    focus: '业务资质、风险敞口、坏账、数据授权、客户价值与收费。',
    opening: '增长曲线再漂亮，也得画在业务边界里面。',
  },
  'general-partner': {
    id: 'general-partner',
    name: '闻舟',
    title: '早期机会派',
    mark: 'W',
    color: 'violet',
    style: '愿意看早期想法，但要求可证伪的假设与小规模验证。',
    focus: '客户痛点、市场切口、替代方案、创始人优势、最小验证。',
    opening: '故事可以从小讲，证据不能凭空长。',
  },
  'growth-partner': {
    id: 'growth-partner',
    name: '周见',
    title: '增长实证派',
    mark: 'Z',
    color: 'orange',
    style: '直率、务实，用用户行为拆穿虚荣指标。',
    focus: '付费转化、分群留存、真实渠道、复购与获客回本。',
    opening: '下载量是热闹，留下来付钱才是生意。',
  },
  'finance-partner': {
    id: 'finance-partner',
    name: '何算',
    title: '财务理性派',
    mark: 'H',
    color: 'green',
    style: '言辞简练，逐项核对单位经济和资金用途。',
    focus: '收入质量、毛利、获客成本、现金消耗、融资里程碑与团队。',
    opening: '你的梦想很贵，先让我看看账本。',
  },
  'seed-coach': {
    id: 'seed-coach',
    name: '许问',
    title: '种子轮 · 需求探索教练',
    mark: 'X',
    color: 'teal',
    style: '鼓励做小实验，尖锐区分用户的礼貌与真实需求。',
    focus: '创始人优势、客户访谈、最小原型、可证伪假设、试验预算。',
    opening: '先证明有人疼，再去讲你的止痛药。',
  },
  'angel-coach': {
    id: 'angel-coach',
    name: '顾初',
    title: '天使轮 · 早期验证教练',
    mark: 'G',
    color: 'orange',
    style: '愿意陪跑，但要求把热情落到用户的实际行动上。',
    focus: '早期用户反馈、产品迭代、团队执行力、付费意愿、验证里程碑。',
    opening: '我可以投早，但不能只投你说得好。',
  },
  'scale-coach': {
    id: 'scale-coach',
    name: '程拓',
    title: 'A 轮 · 规模增长教练',
    mark: 'C',
    color: 'blue',
    style: '拆解增长引擎，关注好结果能不能稳定地复制。',
    focus: '产品市场匹配、渠道回本、销售交付复制、组织能力、规模效应。',
    opening: '创始人拼出来的增长，还不叫增长引擎。',
  },
  'efficiency-coach': {
    id: 'efficiency-coach',
    name: '顾稳',
    title: 'B 轮 · 经营效率教练',
    mark: 'G',
    color: 'green',
    style: '既看规模也算代价，用经营质量检验扩张。',
    focus: '贡献利润、经营现金流、资金效率、管理梯队、竞争与扩张质量。',
    opening: '规模不是护城河，亏得更快也不是。',
  },
  'late-coach': {
    id: 'late-coach',
    name: '唐策',
    title: '后期轮 · 资本战略教练',
    mark: 'T',
    color: 'violet',
    style: '关注公司能否独立运转，审慎对待估值故事和退出承诺。',
    focus: '盈利与现金流质量、治理、资本配置、行业地位、可论证的退出路径。',
    opening: '下一轮融资，不能是你唯一的商业模式。',
  },
};

export interface Industry {
  id: IndustryId;
  name: string;
  shortName: string;
  icon: string;
  subtitle: string;
  color: string;
  lead: string;
  weights: Record<DimensionId, number>;
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'ai',
    name: '人工智能',
    shortName: 'AI',
    icon: '✳',
    subtitle: '模型之外，生意之内',
    color: 'violet',
    lead: 'ai-partner',
    weights: {
      problem: 15,
      market: 10,
      product: 15,
      moat: 20,
      traction: 15,
      business: 10,
      team: 10,
      funding: 5,
    },
  },
  {
    id: 'saas',
    name: '企业服务',
    shortName: 'SaaS',
    icon: '▦',
    subtitle: '续费才是真正的投票',
    color: 'blue',
    lead: 'saas-partner',
    weights: {
      problem: 15,
      market: 10,
      product: 10,
      moat: 10,
      traction: 20,
      business: 20,
      team: 10,
      funding: 5,
    },
  },
  {
    id: 'consumer',
    name: '消费品牌',
    shortName: '消费',
    icon: '◈',
    subtitle: '别只活在种草笔记里',
    color: 'orange',
    lead: 'consumer-partner',
    weights: {
      problem: 10,
      market: 15,
      product: 15,
      moat: 10,
      traction: 20,
      business: 20,
      team: 5,
      funding: 5,
    },
  },
  {
    id: 'hardware',
    name: '硬件科技',
    shortName: '硬科技',
    icon: '⌘',
    subtitle: '从样机到量产的距离',
    color: 'teal',
    lead: 'hardware-partner',
    weights: {
      problem: 10,
      market: 10,
      product: 20,
      moat: 20,
      traction: 10,
      business: 10,
      team: 15,
      funding: 5,
    },
  },
  {
    id: 'health',
    name: '医疗健康',
    shortName: '医疗',
    icon: '✚',
    subtitle: '证据，比概念更重要',
    color: 'teal',
    lead: 'health-partner',
    weights: {
      problem: 15,
      market: 10,
      product: 20,
      moat: 15,
      traction: 10,
      business: 10,
      team: 15,
      funding: 5,
    },
  },
  {
    id: 'climate',
    name: '新能源 / 气候',
    shortName: '新能源',
    icon: '↗',
    subtitle: '算清每一度电的生意',
    color: 'green',
    lead: 'climate-partner',
    weights: {
      problem: 10,
      market: 15,
      product: 15,
      moat: 15,
      traction: 10,
      business: 15,
      team: 10,
      funding: 10,
    },
  },
  {
    id: 'fintech',
    name: '金融科技',
    shortName: '金融',
    icon: '≋',
    subtitle: '先守边界，再谈增长',
    color: 'blue',
    lead: 'fintech-partner',
    weights: {
      problem: 10,
      market: 10,
      product: 10,
      moat: 15,
      traction: 15,
      business: 20,
      team: 15,
      funding: 5,
    },
  },
  {
    id: 'other',
    name: '其他创新',
    shortName: '创新',
    icon: '◇',
    subtitle: '好问题，值得被认真问',
    color: 'violet',
    lead: 'general-partner',
    weights: {
      problem: 20,
      market: 15,
      product: 15,
      moat: 10,
      traction: 15,
      business: 10,
      team: 10,
      funding: 5,
    },
  },
];

export const STAGES = ['想法阶段', '已有原型', '已有用户', '已有收入', '规模增长'] as const;
export const VOTE_LABELS: Record<Vote, string> = {
  invest: '愿意推进',
  watch: '继续观察',
  pass: '暂不投资',
  insufficient: '资料不足',
};
export const getIndustry = (id: IndustryId) => INDUSTRIES.find((item) => item.id === id)!;
export const getRound = (id: RoundId) => FUNDING_ROUNDS.find((item) => item.id === id)!;
export const getPanel = (id: IndustryId, round: RoundId = 'angel'): Investor[] => [
  INVESTORS[getIndustry(id).lead],
  INVESTORS[getRound(round).coach],
  INVESTORS['finance-partner'],
];

/** Combine industry priorities and round expectations; largest remainder keeps integer weights at 100. */
export function getWeights(
  industry: IndustryId,
  round: RoundId = 'angel',
): Record<DimensionId, number> {
  const base = getIndustry(industry).weights,
    multipliers = getRound(round).multipliers;
  const total = DIMENSION_IDS.reduce((sum, id) => sum + base[id] * multipliers[id], 0);
  const values = DIMENSION_IDS.map((id) => ({
    id,
    exact: ((base[id] * multipliers[id]) / total) * 100,
  }));
  const weights = Object.fromEntries(
    values.map((item) => [item.id, Math.floor(item.exact)]),
  ) as Record<DimensionId, number>;
  const remaining = 100 - Object.values(weights).reduce((sum, value) => sum + value, 0);
  [...values]
    .sort((a, b) => (b.exact % 1) - (a.exact % 1))
    .slice(0, remaining)
    .forEach((item) => weights[item.id]++);
  return weights;
}
