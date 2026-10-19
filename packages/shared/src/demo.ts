import { DIMENSIONS, getPanel } from './catalog';
import type { IndustryId, RoundId, Tone } from './catalog';
import type { EvaluationReport, ReviewContent, Submission } from './schema';
import { aggregateReport, prepareReview } from './scoring';

export const EXAMPLES: Record<IndustryId, { name: string; description: string; bp: string }> = {
  ai: {
    name: '拾光 AI',
    description:
      '我们为 10–50 人的内容团队提供 AI 视频粗剪工具，把长视频自动拆成短片。已服务 24 家付费客户，月收入 3.6 万元，帮助客户减少约 60% 粗剪时间。',
    bp: '小范围用户访谈覆盖 40 家内容团队，其中 24 家付费。产品支持语义切片和品牌模板，客户可导出到原有剪辑工作流。目前调用第三方模型 API，没有自研模型。近三个月月收入 3.6 万元，客户月流失率 8%，平均获客成本 2400 元，单客户月均收入 1500 元，模型与交付后毛利率 55%。团队 3 人，包含两位视频算法工程师和一位内容运营负责人。拟融资 300 万元，用于 12 个月的产品与销售，目标达到 100 家付费客户。市场规模尚未做自下而上测算。',
  },
  saas: {
    name: '小店有数',
    description:
      '为连锁咖啡店提供采购与库存协同工具。目前有 18 家付费门店，月订阅收入 1.8 万元，通过库存提醒降低报损。',
    bp: '访谈 30 家咖啡店发现人工盘点耗时且易缺货。产品已在 18 家门店部署，月订阅收入 1.8 万元。试用门店反馈每周节省 4 小时盘点时间。三个月客户留存率 83%，每家部署成本 2000 元，月运维成本 200 元。团队两人，均有零售软件研发经验。计划融资 200 万元覆盖 12 个月开发与销售，目标 80 家门店。暂无净收入留存统计，也未验证跨区域渠道。',
  },
  consumer: {
    name: '轻一口',
    description:
      '为办公室人群提供低糖早餐燕麦杯，通过微信社群和电商店铺销售。过去三个月有 1200 名付费用户，30 天复购率 22%。',
    bp: '访谈 60 位办公室用户，需求是便捷低糖早餐。产品已完成小批量生产，三个月有 1200 名付费用户，30 天复购率 22%，客单价 49 元，产品毛利率 42%，单客投放成本 35 元。暂不含履约和退货成本。两位创始人分别有食品供应链和社群运营经验。拟融资 150 万元，用于 9 个月供应链与渠道验证，目标复购率 35%。尚未测算可触达市场规模。',
  },
  hardware: {
    name: '微触机器人',
    description:
      '为小型加工厂提供可加装的机械臂力控传感器，帮助工人完成精密装配。已有 3 家工厂试用，尚未形成批量订单。',
    bp: '访谈 12 家工厂，精密装配依赖熟练工。力控传感器样机在 3 家工厂试用，客户反馈装配效率提高约 15%，尚待第三方验证。当前 BOM 为 1800 元，计划售价 6000 元，小批次良率 82%。团队有 5 年工业传感器研发经历。拟融资 500 万元，覆盖 18 个月，目标良率达到 95% 并交付 100 套。尚未完成相关认证，量产供应商未签约。',
  },
  health: {
    name: '康步随访',
    description:
      '为康复科提供患者出院随访与训练记录工具，减少护士电话回访时间。已有 2 家医院科室试点，尚无付费客户。',
    bp: '访谈 15 位康复科医护，主要痛点是随访记录分散。产品提供训练记录与医护看板，2 家医院科室试点，参与患者 80 人，连续四周记录率 45%。不提供诊断和治疗建议，未进行临床有效性研究。团队包含一位康复治疗师和两位软件工程师。拟融资 200 万元，用于 12 个月试点验证，目标 5 家付费科室。数据授权流程、采购路径与完整成本测算尚待补充。',
  },
  climate: {
    name: '循能小站',
    description:
      '为工业园区提供储能运行优化软件，根据电价和设备状态优化调度。正在一个园区做试点，暂未签订付费合同。',
    bp: '访谈 8 家园区运营商发现人工调度效率低。一个园区试点 60 天，按试点记录测算用电成本降低约 9%，未经过第三方核验。产品为纯软件，不销售储能设备。团队两人，分别有电力系统和优化算法经验。拟融资 300 万元覆盖 12 个月，目标签约 3 个园区。软件售价、实施成本、不同电价政策下收益与安全责任边界尚未验证。',
  },
  fintech: {
    name: '账见',
    description:
      '为跨境电商小团队提供多平台对账软件，通过只读账单导入核对收支，不经手资金。已有 10 家付费企业，月收入 8000 元。',
    bp: '访谈 25 家跨境商家发现多币种对账耗时。产品支持账单导入、差异识别和只读报表，不做支付、放贷或投资推荐。10 家企业付费，月收入 8000 元，月客户留存率 90%，单客获客成本 1200 元。数据授权仅有现行用户协议，缺少更细的权限与保留说明。团队两人有财税软件研发经验。拟融资 180 万元覆盖 12 个月，目标 60 家付费企业。毛利率与完整合规评估待补充。',
  },
  other: {
    name: '邻里修',
    description:
      '为社区住户提供小家电上门维修撮合服务，按完成订单收取服务费。已覆盖 3 个社区，完成 160 单，平均客单价 85 元。',
    bp: '访谈 50 位住户，维修商选择难、价格不透明。平台已接入 8 位维修师傅，3 个社区完成 160 单，客单价 85 元，平台抽佣 15%，售后返修率 6%。通过社区群自然获客，尚未核算补贴和客服成本。团队有社区运营与软件开发经验。拟融资 100 万元，覆盖 9 个月，目标验证 10 个社区的复制能力。缺少复购统计、服务标准与市场规模测算。',
  },
};

/** Fixed, fictional example only. Arbitrary user input never falls back to this as an AI result. */
export function createDemoReport(
  industry: IndustryId = 'ai',
  tone: Tone = 'sharp',
  round: RoundId = 'angel',
): EvaluationReport {
  const example = EXAMPLES[industry];
  const submission: Submission = {
    projectName: example.name,
    industry,
    round,
    stage: ['hardware', 'health', 'climate'].includes(industry) ? '已有用户' : '已有收入',
    description: example.description,
    bpText: example.bp,
    tone,
    consent: true,
  };
  const sentences = example.bp.split('。').filter(Boolean);
  const baseScores = [78, null, 76, 46, 65, 58, 74, 70];
  const reasons = [
    '需求场景清楚，接下来要核验用户愿意持续付费的原因。',
    '尚缺可触达细分市场的测算，不能用宏观市场替代目标客户。',
    '产品已进入真实场景，但效果数据仍主要来自团队陈述。',
    '已有产品能力，不等于建立了难以复制的优势。',
    '有早期验证，仍需要按时间分群看留存与转化。',
    '收入与成本的口径尚不完整，必须拆到每一位客户。',
    '团队经历与业务相关，还需说明关键岗位缺口。',
    '金额、时间和目标已交代，需要补充分月预算与验收标准。',
  ];
  const actions = [
    '访谈 10 位流失或拒绝付费的用户，记录具体替代方案与付费意愿。',
    '按可触达客户数量 × 年均付费额，做一份有来源的细分市场测算。',
    '选 5 位典型客户做前后对照测试，记录成本、效率与持续使用情况。',
    '列出三家替代方案，用客户迁移成本和独有资产逐项对比。',
    '补充最近三个月每月新增客户的 30 / 60 / 90 天留存。',
    '把获客、交付、模型调用和售后都计入单客户贡献利润。',
    '明确未来 12 个月的关键岗位、招聘顺序及责任人。',
    '把融资预算拆成每月支出，并为每笔钱设定可检验的里程碑。',
  ];
  const reviews = getPanel(industry, round).map((investor, index) => {
    const content: ReviewContent = {
      vote: index === 2 ? 'pass' : 'watch',
      thesis:
        index === 0
          ? '有清楚的使用场景，也有早期验证。距离可投资，还差能经得起追问的留存与竞争证据。'
          : index === 1
            ? '先别急着放大投放。把客户为什么来、为什么走、多久回本说明白，再谈增长飞轮。'
            : '需要把每个客户的完整收入和成本算清楚，并证明融资能换来下一步业务进展。',
      oneLiner:
        tone === 'balanced'
          ? '方向值得继续验证，先补齐留存、壁垒和单位经济的证据。'
          : index === 2
            ? '你的梦想很贵，先让我看看账本。'
            : index === 1
              ? '用户来过，不等于生意来过。'
              : '有了产品的轮廓，还缺生意的骨架。',
      dimensions: DIMENSIONS.map((dimension, dimensionIndex) => ({
        id: dimension.id,
        score:
          baseScores[dimensionIndex] === null
            ? null
            : Math.max(0, baseScores[dimensionIndex]! - index * 4),
        evidence:
          baseScores[dimensionIndex] === null ? '' : sentences[dimensionIndex % sentences.length],
        reason: reasons[dimensionIndex],
        action: actions[dimensionIndex],
      })),
      questions: [
        '最容易流失的客户有什么共同点？',
        '如果把获客和交付都算进去，每个客户多久回本？',
        '下一轮融资前，你准备证明哪一个关键假设？',
      ],
      risks: [
        '本报告使用虚构项目和固定演示评分，不是对真实项目的 AI 评估。',
        '客户留存和完整成本仍需进一步核验。',
      ],
    };
    return prepareReview(content, investor.id, '固定演示 · 非模型调用', submission);
  });
  return aggregateReport(submission, reviews, {
    id: `demo-${industry}-${Date.now()}`,
    mode: 'demo',
  });
}
