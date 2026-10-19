import type { DimensionId, IndustryId, RoundId } from './catalog';

export const PREFERENCE_IDS = [
  'technology',
  'growth',
  'financial',
  'product',
  'team',
  'strategy',
] as const;
export type PreferenceId = (typeof PREFERENCE_IDS)[number];
export const DEFAULT_PREFERENCES: readonly PreferenceId[] = ['technology', 'growth', 'financial'];
export const PANEL_SIZE = 3;

export interface InvestmentPreference {
  id: PreferenceId;
  name: string;
  mark: string;
  color: string;
  style: string;
  question: string;
  dimensions: DimensionId[];
  demoAdjustment: number;
}

export const PREFERENCES: InvestmentPreference[] = [
  {
    id: 'technology',
    name: '技术壁垒',
    mark: 'T',
    color: 'violet',
    style: '追问可复现的技术优势、独有资产与复制难度。尊重研发周期，不把技术名词当证据。',
    question: '竞争者拿到同样的工具，为什么不能做出相同结果？',
    dimensions: ['product', 'moat'],
    demoAdjustment: 0,
  },
  {
    id: 'growth',
    name: '增长验证',
    mark: 'G',
    color: 'orange',
    style: '用分群行为和渠道实验拆解增长，区分自然需求、补贴和偶发订单。',
    question: '去掉补贴和创始人的人脉，增长还能重复发生吗？',
    dimensions: ['market', 'traction'],
    demoAdjustment: -4,
  },
  {
    id: 'financial',
    name: '财务回报',
    mark: 'F',
    color: 'green',
    style: '逐项核对收入、完整成本、现金消耗与融资用途，早期看验证预算，后期看经营质量。',
    question: '这笔钱究竟验证什么，最坏情况下还能撑多久？',
    dimensions: ['business', 'funding'],
    demoAdjustment: -8,
  },
  {
    id: 'product',
    name: '产品客户',
    mark: 'P',
    color: 'teal',
    style: '站在客户的工作现场提问，要求痛点、替代方案和持续使用的证据。',
    question: '客户为什么要改变习惯，换成你的产品？',
    dimensions: ['problem', 'product'],
    demoAdjustment: -2,
  },
  {
    id: 'team',
    name: '团队执行',
    mark: 'E',
    color: 'blue',
    style: '从过往执行、关键岗位和复盘速度判断团队适配，不以名校或大厂标签代替能力。',
    question: '最关键的一次验证由谁负责，做错后怎么调整？',
    dimensions: ['team', 'funding'],
    demoAdjustment: -3,
  },
  {
    id: 'strategy',
    name: '产业战略',
    mark: 'S',
    color: 'violet',
    style: '审视价值链位置、合作依赖、竞争应对与资本效率，拒绝把合作意向当确定订单。',
    question: '你在价值链上不可替代的位置，究竟在哪里？',
    dimensions: ['market', 'moat'],
    demoAdjustment: -5,
  },
];

export const getPreference = (id: PreferenceId) => PREFERENCES.find((item) => item.id === id)!;

interface IndustryLens {
  focus: string;
  question: string;
  opening: string;
  task: string;
}

/** Domain-specific evidence and actions, rather than cosmetic persona names. */
export const INDUSTRY_LENSES: Record<IndustryId, Record<PreferenceId, IndustryLens>> = {
  ai: {
    technology: {
      focus: '自有数据授权、评测集、模型依赖、推理成本与工作流迁移壁垒。',
      question: '换掉底层模型后，效果、成本和客户留存还能保持吗？',
      opening: '接了模型，不代表筑了壁垒。',
      task: '在同一评测集对比替代模型，列出效果、单次成本和独有数据来源。',
    },
    growth: {
      focus: '激活到付费的漏斗、任务完成率、分群留存与模型费用后的渠道回本。',
      question: '尝鲜用户退潮后，哪些客户仍在高频付费使用？',
      opening: '围观的人很多，续费的人呢？',
      task: '按获客月份拆出激活、四周留存、付费和渠道成本，剔除补贴账户。',
    },
    financial: {
      focus: '订阅或用量收入、推理与人工交付成本、贡献毛利、现金跑道。',
      question: '把推理、人工兜底和获客都算进去，每位客户还剩多少利润？',
      opening: '你的智能，能替账本省几个零？',
      task: '按客户核算模型调用、人工交付、获客和售后成本，做调用量翻倍的现金预算。',
    },
    product: {
      focus: '客户原工作流、结果可用率、错误代价、人工复核和持续使用意愿。',
      question: '客户最终采用了多少 AI 输出，节省的时间如何核验？',
      opening: '演示很聪明，客户还在加班吗？',
      task: '跟踪五位客户的完整任务，记录输出采用率、复核时间和替代工作流。',
    },
    team: {
      focus: '产品与模型工程协作、评测责任、上线复盘、数据授权负责人。',
      question: '模型出错或供应商调价时，谁负责在多长时间内恢复服务？',
      opening: '全员会写提示词，谁来扛交付？',
      task: '明确产品、评测、数据授权和故障响应负责人，用一次上线复盘验证协作。',
    },
    strategy: {
      focus: '基础模型供应依赖、垂直渠道、客户迁移成本与上游进入风险。',
      question: '模型厂商免费提供同类能力后，客户为什么还需要你？',
      opening: '站在风口，也可能站在别人的入口。',
      task: '画出模型供应商、渠道和客户价值链，验证一条不依赖单一上游的交付路径。',
    },
  },
  saas: {
    technology: {
      focus: '多租户能力、系统集成、权限与数据隔离、可复用产品占比。',
      question: '新增客户需要多少定制，哪些能力真正可以复用？',
      opening: '一客一套代码，不叫软件飞轮。',
      task: '对照三家客户列出共用模块、定制工时、数据隔离和迁移成本。',
    },
    growth: {
      focus: '试用转付费、续费、净收入留存、销售周期和分渠道回本。',
      question: '去掉最大客户和创始人直销，续费与新签还剩多少？',
      opening: '签约是开场，续费才是投票。',
      task: '按签约月份与渠道列出续费、扩单、流失原因和销售回本周期。',
    },
    financial: {
      focus: '经常性收入与实施费拆分、交付毛利、回款周期和合同负债。',
      question: '报表里的订阅收入，有多少其实是一次性实施服务？',
      opening: '把项目费写成订阅，账本不会买单。',
      task: '拆分订阅、实施、外包收入，逐客户列交付工时、毛利和实际回款。',
    },
    product: {
      focus: '真实使用席位、关键流程完成率、采购者与使用者的价值差异。',
      question: '采购者签了合同，一线员工为什么愿意每天打开？',
      opening: '老板买了，不代表员工离不开。',
      task: '分别访谈采购者、管理员和一线用户，跟踪关键流程周活与失败原因。',
    },
    team: {
      focus: '销售、研发与客户成功协作，定制边界和交付负责人。',
      question: '销售承诺与标准产品冲突时，谁能守住交付边界？',
      opening: '销售在许愿，研发在还债？',
      task: '复盘最近三单，从售前承诺到上线验收标记责任、延期和返工工时。',
    },
    strategy: {
      focus: '生态平台依赖、渠道分成、垂直市场切口和替代系统迁移。',
      question: '平台把你的功能变成标配时，你还掌握哪段客户关系？',
      opening: '生态给你入口，也能收回入口。',
      task: '验证客户直达渠道与系统迁移壁垒，列出平台政策变化的替代路径。',
    },
  },
  consumer: {
    technology: {
      focus: '配方或工艺可验证性、品质一致性、知识产权与模仿成本。',
      question: '去掉包装和联名，产品本身有什么难以复制的差异？',
      opening: '包装有专属色，产品有专属力吗？',
      task: '做盲测和批次质量对照，说明配方、工艺及权利归属的实际差异。',
    },
    growth: {
      focus: '自然复购、退货、分渠道获客、促销依赖和真实消费频次。',
      question: '恢复原价且停止达人投放后，用户还会再次购买吗？',
      opening: '种草很热闹，复购别靠补贴。',
      task: '按首购渠道拆出原价复购、退货与投放成本，单列促销用户。',
    },
    financial: {
      focus: '扣除平台、物流、退货与投放后的贡献毛利，库存和现金周转。',
      question: '毛利扣完履约和退货后，还有多少钱能进银行？',
      opening: '毛利很美，仓库里的钱醒着吗？',
      task: '核算单件完整贡献利润，按库龄列滞销库存和未来三个月现金回收。',
    },
    product: {
      focus: '消费场景、品类替代、感官或功能体验与真实用户反馈。',
      question: '如果货架上没有你的品牌，用户会买谁，为什么？',
      opening: '朋友说喜欢，陌生人会掏钱吗？',
      task: '访谈首购、复购和流失用户，做与三款替代品的盲测对照。',
    },
    team: {
      focus: '选品、供应链、品控和渠道运营的责任边界与纠错速度。',
      question: '出现一批质量问题时，谁决定停货、追溯和赔付？',
      opening: '会做爆款，也得有人管烂摊子。',
      task: '复盘一次质量或售后事件，明确停货、追溯、供应商与客服负责人。',
    },
    strategy: {
      focus: '渠道议价权、供应商集中度、品类心智和线下扩张条件。',
      question: '渠道涨佣或供应商提价后，品牌还保有多少议价权？',
      opening: '货架给你位置，未必给你利润。',
      task: '列渠道与供应商集中度，验证一个可直接触达用户的可持续销售场景。',
    },
  },
  hardware: {
    technology: {
      focus: '技术成熟度、可靠性测试、专利归属、BOM、量产良率。',
      question: '实验室指标换到量产批次后，性能和良率还能保持吗？',
      opening: '样机上了台，良率上得去吗？',
      task: '提供样机与小批量测试对照，列BOM、良率、故障和专利权利归属。',
    },
    growth: {
      focus: '试点转量产订单、客户验收、采购周期、复购与服务覆盖。',
      question: '试用工厂愿意下批量订单，还是只愿意免费试一试？',
      opening: '试点不是订单，订单也未必回款。',
      task: '逐试点跟踪验收条件、采购决策者、批量订单、复购和回款。',
    },
    financial: {
      focus: 'BOM与制造全成本、库存、账期、售后准备和量产现金需求。',
      question: '把备货、返修和客户账期都算上，每多卖一台要垫多少钱？',
      opening: '流水线跑起来，现金别先跑光。',
      task: '拆出制造、备货、认证与售后成本，按交付批次测算现金峰值。',
    },
    product: {
      focus: '现场可靠性、安装维护难度、客户停机风险与效率收益。',
      question: '客户现场出了故障，节省的工时够不够赔停机损失？',
      opening: '参数赢了，客户现场也赢了吗？',
      task: '在客户现场记录安装、稳定运行、故障和维护时间，与现有方案对照。',
    },
    team: {
      focus: '研发转产、供应链和质量负责人的经验与跨团队交付。',
      question: '从样机转量产的最后一道难题，谁真正负责解决？',
      opening: '会造第一台，谁来交第一千台？',
      task: '明确研发、转产、质量与供应链责任人，提供小批量交付复盘。',
    },
    strategy: {
      focus: '核心器件依赖、产能约束、客户集中度与产业协同条件。',
      question: '核心器件断供或大客户延迟采购，有没有可验证的替代路径？',
      opening: '卡住别人的脖子前，先看自己的。',
      task: '验证关键器件第二来源，列产能、供应约束和头部客户采购替代情景。',
    },
  },
  health: {
    technology: {
      focus: '研究与临床证据的区分、可重复性、适用范围和注册路径。',
      question: '哪些结果仅是研究假设，哪些已有与用途匹配的验证证据？',
      opening: '论文翻过去，证据还站得住吗？',
      task: '按产品宣称列研究设计、证据来源、适用范围和待完成的注册验证。',
    },
    growth: {
      focus: '试点转采购、科室到医院扩展、实际使用与合规销售路径。',
      question: '试点的科室愿意用，谁有预算、谁能批准采购？',
      opening: '进了科室，不等于进了预算。',
      task: '逐试点列使用、付费决策链、采购条件和转正式合同的里程碑。',
    },
    financial: {
      focus: '验证和准入成本、回款周期、支付方、交付维护与现金预算。',
      question: '等待验证和采购的这段时间，现金预算覆盖了哪些必要步骤？',
      opening: '准入很漫长，预算别靠想象。',
      task: '按验证、准入、采购与交付阶段列成本、付款条件和保守现金跑道。',
    },
    product: {
      focus: '医护工作负担、患者授权、实际用途、错误风险和适用边界。',
      question: '产品减少了哪段工作，又增加了多少录入、复核和授权负担？',
      opening: '别让帮助医护，变成增加表格。',
      task: '在授权场景观察完整医护流程，记录新增负担、复核机制和用户退出路径。',
    },
    team: {
      focus: '临床、研发、注册与数据治理协作及责任划分。',
      question: '临床需求、技术判断与用途边界冲突时，谁能作出负责任的决定？',
      opening: '白大褂在合照里，还是在决策里？',
      task: '列临床、研发、注册和数据治理负责人，复盘一次用途变更的评审记录。',
    },
    strategy: {
      focus: '医院或产业合作依赖、支付与采购链条、商业准入和数据权利。',
      question: '合作意向能否转成可持续采购，数据和成果权利如何约定？',
      opening: '合作牌匾很亮，采购路径清楚吗？',
      task: '梳理使用方、采购方、支付方和合作机构，核对合同与成果权利边界。',
    },
  },
  climate: {
    technology: {
      focus: '工况下的效率验证、寿命、安全、第三方测试与技术权利。',
      question: '节能或效率提升在不同工况下仍成立吗，有独立测试吗？',
      opening: '实验室的绿，能扛现场的灰吗？',
      task: '按典型工况列基线、测量方法、安全边界和独立验证结果。',
    },
    growth: {
      focus: '试点转付费、园区或工商业采购、项目复制与收益验证。',
      question: '离开第一个示范项目，第二个客户为什么会按同样条件买单？',
      opening: '示范牌很大，复制成本多大？',
      task: '对照三个目标项目，列采购流程、交付差异、付费条件和获客周期。',
    },
    financial: {
      focus: '单位成本、资本开支、运维、政策依赖与现金回收敏感性。',
      question: '去掉补贴、改变电价或利用率后，单位经济还成立吗？',
      opening: '愿景很绿，现金流别一直红。',
      task: '用不同电价、利用率和补贴假设重算项目收益与现金回收，注明数据来源。',
    },
    product: {
      focus: '现场运维、可靠性、客户收益测量与安全责任边界。',
      question: '运营人员每天要多做什么，节省的成本由谁核验？',
      opening: '方案很节能，现场省心了吗？',
      task: '跟踪一个完整运行周期，记录运维工作、故障、收益测量和责任分工。',
    },
    team: {
      focus: '工程、现场交付、运维与安全协作，项目延期的应对能力。',
      question: '现场延期或设备异常时，谁对交付、安全和客户沟通负责？',
      opening: 'PPT 能交付，现场谁值班？',
      task: '提供项目节点和异常复盘，明确工程、运维、安全和客户验收责任人。',
    },
    strategy: {
      focus: '价值链位置、能源或设备合作依赖、区域政策和客户议价权。',
      question: '政策或产业伙伴调整后，你还掌握哪部分独立客户价值？',
      opening: '站对政策窗口，也要有自己的门。',
      task: '列关键伙伴、区域政策和替代客户路径，核验去掉单一合作方后的交付能力。',
    },
  },
  fintech: {
    technology: {
      focus: '数据授权、安全隔离、对账或识别准确率、可审计性。',
      question: '技术效果能复核吗，数据来源和访问权限是否有明确依据？',
      opening: '算法黑箱，不能顺便把责任也藏了。',
      task: '列数据来源、最小权限、准确率验证与审计追踪，区分软件能力和受监管业务。',
    },
    growth: {
      focus: '合规获客、持续付费、客户集中度与风险调整后的增长质量。',
      question: '增长依赖的是持续客户价值，还是补贴、导流和风险暴露？',
      opening: '增长很快，风险别跑得更快。',
      task: '按渠道列付费、留存、客诉与风险事件，剔除补贴和不可持续导流。',
    },
    financial: {
      focus: '收费与资金流边界、完整交付成本、回款及适用业务风险敞口。',
      question: '收入是否与实际服务相符，资金流和潜在风险由谁承担？',
      opening: '收入是你的，尾部风险是谁的？',
      task: '核对合同收费、实际资金流、完整服务成本和适用业务下的风险承担方。',
    },
    product: {
      focus: '客户工作流、误报漏报代价、授权撤回、数据保留与可解释性。',
      question: '结果出错或用户撤回授权时，产品能否清楚解释并处理？',
      opening: '界面很顺滑，授权别一团糊。',
      task: '走查客户授权、使用、纠错和退出流程，记录误报成本与数据保留边界。',
    },
    team: {
      focus: '研发、风控与合规协作，权限管理和事件处置责任。',
      question: '业务增长与风险边界冲突时，谁有权叫停？',
      opening: '风控不是融资前临时补的岗位。',
      task: '明确业务、研发、风控与数据责任人，复盘一次权限或风险事件处理。',
    },
    strategy: {
      focus: '业务资质边界、金融机构依赖、渠道议价与数据合作权利。',
      question: '关键机构或平台终止合作后，哪些业务仍能独立、合规地成立？',
      opening: '借来的通道，别写成自己的护城河。',
      task: '画出机构、平台、数据和资金关系，逐项核对合作期限、权利与替代路径。',
    },
  },
  other: {
    technology: {
      focus: '核心能力可复现性、知识资产、关键依赖与复制难度。',
      question: '竞争者照着做时，真正卡住他的是什么？',
      opening: '别人没做，和别人做不了是两回事。',
      task: '对照三种替代方案，验证核心能力的效果、权利归属和复制成本。',
    },
    growth: {
      focus: '真实需求、留存、复购、获客渠道与跨场景复制。',
      question: '第一个场景里的好结果，能在第二个场景重复吗？',
      opening: '第一单靠朋友，第二十单靠什么？',
      task: '按渠道记录成交、留存和复购，设计一个脱离熟人关系的获取客户实验。',
    },
    financial: {
      focus: '收费逻辑、完整单客成本、现金消耗与验证预算。',
      question: '每完成一单，扣完所有成本后还剩多少现金？',
      opening: '生意可以小，账不能一直糊。',
      task: '逐单列收入、获客、履约和售后成本，拆出下一阶段验证预算。',
    },
    product: {
      focus: '痛点真实性、替代行为、用户使用障碍和价值验证。',
      question: '用户现在如何解决这个问题，为什么愿意换成你？',
      opening: '你的灵感，是用户的刚需吗？',
      task: '访谈真实目标客户与拒绝使用者，记录当前替代方案和改变行为的条件。',
    },
    team: {
      focus: '创始人问题适配、执行复盘、关键岗位与阶段目标责任。',
      question: '谁最懂这个问题，谁能把下一个验证实验做完？',
      opening: '履历很满，验证日历别空着。',
      task: '用最近一次实验说明假设、负责人、结果和调整，补齐关键能力缺口。',
    },
    strategy: {
      focus: '细分市场切口、上下游依赖、议价权和合作替代路径。',
      question: '价值链里谁离不开你，谁随时可以替换你？',
      opening: '市场很大，你站得住的地方多大？',
      task: '从可触达客户自下而上测算市场，验证上下游合作与一个独立获客渠道。',
    },
  },
};

/** The same preference asks different questions at each financing stage. */
export const ROUND_QUESTIONS: Record<RoundId, Record<PreferenceId, string>> = {
  seed: {
    technology: '最小原型要验证哪项技术假设，失败的判据是什么？',
    growth: '前十位目标用户从哪里找，什么行为算真实需求？',
    financial: '最小验证需要花多少钱，在哪个结果出现前不应追加投入？',
    product: '哪一次访谈或观察最可能推翻你对痛点的判断？',
    team: '创始人与问题为什么匹配，下一个实验由谁负责？',
    strategy: '先切哪一小群客户，为什么此时有进入窗口？',
  },
  angel: {
    technology: '早期产品的优势是否可复现，哪些关键依赖尚未验证？',
    growth: '最初用户有何持续使用或付费行为，下一次实验怎么复现？',
    financial: '下一笔小额资金换来哪项验证，预算和停止条件是什么？',
    product: '首批用户真正采用了哪些功能，拒绝使用的原因是什么？',
    team: '团队如何根据早期反馈迭代，最关键的能力缺口是什么？',
    strategy: '首批客户为什么选你，早期合作能否形成可保留的资产？',
  },
  'pre-a': {
    technology: '从原型到稳定产品，可靠性、维护成本与技术优势如何验证？',
    growth: '按时间分群的留存和付费，能否支持可重复的获客假设？',
    financial: '初步单位经济是否包含全部交付成本，现金能否覆盖下一轮验证？',
    product: '哪些客户群出现稳定使用，哪些需求仍依赖大量人工服务？',
    team: '从创始人亲自交付转为分工执行，哪些环节已经可复制？',
    strategy: '最有希望的细分市场和渠道组合，如何排除偶然大单的干扰？',
  },
  a: {
    technology: '客户规模增长后，可靠性、架构和技术壁垒能否同步增强？',
    growth: '增长引擎能跨渠道或区域复制吗，回本和留存会不会恶化？',
    financial: '扩张预算、收入质量与现金消耗，是否支持可验收的规模目标？',
    product: '标准产品是否能覆盖扩张客户，体验是否依赖超额人工服务？',
    team: '销售、产品和交付的负责人及机制，能否接住计划中的规模？',
    strategy: '扩张市场的优先级与竞争应对依据是什么，合作有没有排他代价？',
  },
  b: {
    technology: '规模下的质量、技术效率和持续研发，是否在改善竞争地位？',
    growth: '新增规模的边际获客和交付效率，有没有侵蚀原有客户质量？',
    financial: '完整历史财务、经营现金流和压力预算，能否证明增长质量？',
    product: '大客户、小客户和新区域的使用质量与满意度差异如何处理？',
    team: '管理梯队、激励与内控机制，能否避免扩张失控和关键人依赖？',
    strategy: '集中度、伙伴议价和竞争格局变化，会如何影响扩张韧性？',
  },
  growth: {
    technology: '技术资产的持续竞争力、权利归属与研发投入回报，有何长期证据？',
    growth: '成熟业务的自然增长、新业务投入与存量留存，能否分别核验？',
    financial: '盈利、现金流、资本配置与退出假设，是否经得起独立核验和压力情景？',
    product: '产品组合的真实客户价值和维护成本，支持哪些保留或退出决策？',
    team: '治理、接班与关键风险责任，是否足以支撑公司独立运转？',
    strategy: '不依赖下一轮融资，行业地位、资本配置和可论证的退出路径是否成立？',
  },
};
