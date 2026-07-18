export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = ["zh-CN", "en-US"];

export const localeOptions = [
  { value: "zh-CN", label: "中文", shortLabel: "中" },
  { value: "en-US", label: "English", shortLabel: "EN" }
];

export const messages = {
  "zh-CN": {
    language: {
      label: "语言",
      chinese: "中文",
      english: "English"
    },
    app: {
      name: "货代装箱体积规划系统",
      workspace: "工作台",
      loadingAuth: "正在检查登录状态..."
    },
    landing: {
      metaTitle: "DrewesLogistics · 德鲁威斯（上海）供应链管理有限公司",
      brandAria: "返回 DrewesLogistics 首页",
      loader: {
        aria: "DrewesLogistics 平台正在加载",
        copy: "正在连接全球货运工作流",
        skip: "跳过动画"
      },
      nav: {
        aria: "主页导航",
        home: "首页",
        capabilities: "平台能力",
        features: "平台功能",
        tracking: "Cargo Tracking",
        roadmap: "建设路线",
        about: "关于德鲁威斯"
      },
      status: {
        available: "已上线",
        public: "公开查询",
        publicFree: "公开免费",
        planned: "规划中"
      },
      entry: {
        enter: "登录平台",
        open: "进入平台",
        admin: "进入总后台"
      },
      hero: {
        explore: "查看平台能力",
        signalEyebrow: "运输信号",
        signalStatus: "全球链路运行中",
        paginationAria: "首屏内容切换",
        goToSlide: "切换到第 {index} 页",
        previous: "上一页",
        next: "下一页",
        slides: {
          platform: {
            kicker: "货代数字化运营平台",
            title: "让每一票货物，从计划到交付，全程清晰可见。",
            description: "DrewesLogistics 将智能装箱与货物追踪组织在统一入口，并为船期订舱和企业 ERP 接入保留持续扩展的空间。"
          },
          planning: {
            kicker: "已上线 · 智能装箱",
            title: "把装箱经验，转化为可查看、可调整的方案。",
            description: "根据货物与箱型数据辅助制定装载方案，直观呈现空间利用、重心与业务约束。",
            action: "进入装箱工作台"
          },
          tracking: {
            kicker: "公开服务 · Cargo Tracking",
            title: "从参考号到关键节点，快速掌握货物动态。",
            description: "无需登录即可进入货物追踪，按提单号、订舱号或箱号查询承运人运输节点。",
            action: "立即查询货物"
          }
        }
      },
      capabilities: {
        aria: "DrewesLogistics 平台能力",
        planning: {
          title: "智能装箱",
          description: "从货物与箱型数据生成三维装载方案，辅助校验空间、载荷与业务约束。",
          action: "登录后使用"
        },
        tracking: {
          title: "货物追踪",
          description: "汇集承运人运输节点，公开查询当前状态、关键时间与路线详情。",
          action: "免登录查询"
        },
        booking: {
          title: "船期与订舱",
          description: "计划接入船期查询与订舱辅助，减少跨平台查找和重复录入。",
          action: "查看建设路线"
        },
        erp: {
          title: "企业 ERP 接入",
          description: "计划通过标准接口连接订单、货物与运输数据，形成连贯业务流。",
          action: "查看建设路线"
        },
        summary: {
          current: "当前能力",
          currentDetail: "装箱与追踪已可使用",
          tracking: "公共追踪",
          trackingDetail: "无需登录，直接查询"
        }
      },
      statement: {
        eyebrow: "一个入口 · 清晰边界",
        title: "连接正在使用的业务工具，也为下一阶段留足空间。",
        description: "DrewesLogistics 保留各模块清晰的业务边界，通过统一品牌入口组织装箱与追踪能力。货物追踪面向客户公开，企业工作台与管理能力继续由登录权限保护。",
        track: "公开查询货物",
        metricOnline: "项能力已上线",
        metricPublic: "项公开查询服务",
        metricRoadmap: "项平台能力布局"
      },
      company: {
        eyebrow: "COMPANY PROFILE · 上海",
        internationalName: "DREWES (SHANGHAI) SUPPLY CHAIN MANAGEMENT CO., LTD.",
        legalName: "德鲁威斯（上海）供应链管理有限公司",
        description: "德鲁威斯（上海）供应链管理有限公司成立于 2023 年 3 月 16 日，注册于上海市虹口区，业务围绕供应链管理、国际与国内货运代理，以及船舶和运输设备相关服务展开。",
        detail: "经营范围包括供应链管理服务、国际货物运输代理、海上／航空／陆路国际货运代理、报检业务、国际船舶代理、国内货运代理、运输设备与船舶租赁、集装箱销售及无船承运业务。",
        incorporatedLabel: "成立日期",
        typeLabel: "企业类型",
        typeValue: "有限责任公司（自然人独资）",
        industryLabel: "所属行业",
        industryValue: "商务服务业",
        platformAction: "查看平台能力",
        creditCodeLabel: "统一社会信用代码",
        sourceNote: "企业基础信息与经营范围依据用户提供的公开工商登记截图整理；登记信息可能发生变更，请以国家企业信用信息公示系统最新记录为准。",
        operationsEyebrow: "SHANGHAI OPERATIONS",
        operationsTitle: "运输协同台",
        operationsOrigin: "上海执行",
        operationsHub: "节点协同",
        operationsGlobal: "全球交付",
        operationsStatus: "多式联运链路",
        servicesEyebrow: "PRIMARY BUSINESS",
        servicesTitle: "围绕供应链与货运代理，连接每一个关键环节。",
        servicesDescription: "从工商登记经营范围中提炼六项主要业务，清晰呈现企业当前登记的服务边界。",
        services: {
          oceanAir: {
            title: "供应链管理服务",
            description: "围绕货物流转与运输资源，组织供应链环节协同。"
          },
          groundRail: {
            title: "海上国际货运代理",
            description: "承接海上国际货物运输代理及相关节点衔接。"
          },
          project: {
            title: "航空与陆路国际货运代理",
            description: "衔接航空、陆路国际货运代理与多运输方式协同。"
          },
          warehouse: {
            title: "国际船舶代理与无船承运",
            description: "开展国际船舶代理及无船承运相关业务。"
          },
          compliance: {
            title: "国内货运代理与报检",
            description: "提供国内货运代理并衔接报检业务。"
          },
          technology: {
            title: "租赁与集装箱服务",
            description: "涵盖运输设备、船舶租赁与集装箱销售。"
          }
        }
      },
      roadmap: {
        eyebrow: "建设路线",
        title: "从独立工具，逐步走向连贯的货代工作流。",
        description: "先稳定现有装箱与追踪能力，再按真实业务价值接入船期、订舱和 ERP 数据，不提前承诺尚未上线的功能。",
        currentLabel: "当前阶段",
        currentTitle: "智能装箱 · 货物追踪",
        currentDescription: "装箱工作台需登录使用；Cargo Tracking 作为公开查询入口直接开放。",
        nextLabel: "下一阶段",
        nextTitle: "船期订舱 · ERP 接入",
        nextDescription: "围绕订单与运输数据逐步连接企业内部和外部服务。",
        viewWorkspaces: "查看现有工作台"
      },
      cta: {
        eyebrow: "START WITH DrewesLogistics",
        title: "从一次查询开始，看见更连贯的货运协作。",
        description: "公开追踪无需登录；进入装箱工作台或总后台时，平台会验证企业账号与权限。",
        publicTracking: "打开 Cargo Tracking"
      },
      transition: {
        copy: "正在进入业务工作台",
        returnHome: "正在返回 DrewesLogistics 首页"
      },
      footer: {
        tagline: "面向货代业务的模块化数字运营平台",
        signIn: "企业登录",
        quickLinks: "快速入口",
        registrationTitle: "企业登记信息",
        termLabel: "营业期限",
        termValue: "无固定期限",
        contactTitle: "登记与地址",
        registeredAddressLabel: "工商注册地址",
        registeredAddress: "上海市虹口区海宁路 137 号 7 层（集中登记地）",
        authorityLabel: "登记机关",
        authority: "虹口区市场监督管理局",
        disclaimer: "企业登记信息可能发生变更，请以国家企业信用信息公示系统最新记录为准。",
        copyright: "© 2026 德鲁威斯（上海）供应链管理有限公司",
        platform: "Cargo Operations Suite"
      }
    },
    login: {
      brandPanelLabel: "货代装箱规划平台介绍",
      productLine: "Cargo Planning OS",
      kicker: "国际货代智能装箱决策平台",
      heroTitle: "让每一立方米，",
      heroAccent: "成为可计算的运输效率",
      heroDescription: "融合三维装箱、约束识别与重心校验，为国际货代团队提供清晰、可靠的配载决策。",
      capabilityPacking: "三维装箱计算",
      capabilityBalance: "重心与载荷校验",
      capabilityRules: "业务约束识别",
      visualEyebrow: "PLANNING SIMULATION",
      visualTitle: "智能配载推演",
      visualStatus: "实时就绪",
      routeOrigin: "起运港",
      routeDestination: "目的港",
      metricSpace: "空间建模",
      metricBalance: "载荷校验",
      metricConstraint: "约束识别",
      engineOnline: "规划引擎在线",
      releaseLabel: "Enterprise Release · 2026",
      secureAccess: "企业安全入口",
      formEyebrow: "ENTER WORKSPACE",
      formTitle: "登录规划工作台",
      formDescription: "使用企业账号继续您的装箱规划任务。",
      usernameLabel: "账号",
      usernamePlaceholder: "请输入企业账号",
      passwordLabel: "密码",
      passwordPlaceholder: "请输入登录密码",
      showPassword: "显示密码",
      hidePassword: "隐藏密码",
      sessionNotice: "6 小时安全会话",
      accountNotice: "账号由管理员统一分配",
      signIn: "安全登录",
      signingIn: "正在验证身份...",
      securityNotice: "登录过程受加密会话与设备策略保护",
      platformName: "Cargo Planning Platform",
      footerTagline: "让装箱决策更清晰",
      errorFallback: "登录失败，请检查账号或密码"
    },
    portal: {
      brandAria: "返回工作台入口",
      productLine: "Cargo Operations Suite",
      systemReady: "系统入口就绪",
      adminConsole: "管理后台",
      logout: "退出",
      operator: "操作员",
      roleAdmin: "系统管理员",
      roleEmployee: "企业员工",
      roleBusiness: "业务员",
      greeting: "你好，{name}。选择今天的工作台",
      heroDescription: "装箱决策与货物追踪现已整合到同一业务平台，通过统一登录入口快速切换。",
      availableWorkbenches: "可用工作台",
      sharedIdentity: "统一登录入口",
      operationCoverage: "业务持续可用",
      routePlanning: "装载规划",
      routeTracking: "运输追踪",
      sectionAria: "可用工作台",
      sectionEyebrow: "SELECT A WORKBENCH",
      sectionTitle: "进入业务工作台",
      sectionDescription: "两个工作台共享统一入口与登录状态，同时保持清晰的业务边界。",
      ready: "就绪",
      connected: "已接入",
      enterWorkbench: "进入工作台",
      switchWorkbench: "切换工作台",
      entering: "正在进入工作台入口",
      enteringAdmin: "正在进入总管理后台",
      footerHint: "一个仓库 · 统一入口 · 清晰业务边界",
      planner: {
        label: "装箱决策",
        title: "货代装箱规划工作台",
        description: "录入货物与箱型约束，完成三维装载计算、重心校验和方案导出。",
        featurePacking: "三维装箱",
        featureBalance: "重心校验",
        featureReport: "方案导出"
      },
      tracking: {
        label: "运输可视化",
        title: "货物追踪工作台",
        description: "按提单、订舱号或箱号查询运输轨迹，查看关键节点与预计到达时间。",
        featureReferences: "多单号查询",
        featureRoute: "运输节点",
        featureChannels: "双通道查询"
      }
    },
    metrics: {
      spaceUtilization: "空间利用率",
      deckUtilization: "甲板利用率",
      currentBoxPieces: "本柜件数",
      currentBoxVolume: "本柜体积",
      currentBoxSpaceUtilization: "本柜空间利用率",
      currentBoxDeckUtilization: "本柜甲板利用率",
      currentBoxWeight: "本柜重量",
      boxProgress: "第 {current}/{total} 柜",
      planAverageUtilization: "方案平均 {value}%",
      currentBoxPlanHint: "当前显示第 {current}/{total} 柜；上方四项仅代表本柜，整套方案平均利用率为 {value}%。",
      lengthPercent: "长度 {value}%",
      lengthSuffix: " · 长度 {value}%",
      deckUtilizationWithLength: "甲板利用率 {value}%{length}"
    },
    sceneOptions: {
      showAxes: "坐标轴",
      axisScale: "坐标轴大小",
      axisSmall: "小",
      axisNormal: "中",
      axisLarge: "大",
      loadBearing: "可承重",
      nonStackable: "不可重压",
      keepUpright: "保持朝上",
      clearanceEnvelope: "间隙占位包络",
      physicalOuterSize: "实际外廓（当前朝向）",
      reservedEnvelopeSize: "占位包络（含间距）",
      horizontalGapDetail: "水平净距 {gap} cm（每侧 {side} cm）",
      physicalCoordinates: "实物坐标",
      reservedCoordinates: "占位坐标"
    },
    duration: {
      secondsShort: "{value} 秒",
      minutesShort: "{minutes} 分钟",
      minutesSecondsShort: "{minutes} 分 {seconds} 秒"
    },
    packingStatus: {
      commonReady: "常用箱型已出结果，特殊箱型补算中",
      partialReady: "部分方案可查看，其他箱型继续计算中"
    },
    smartImport: {
      recognitionPlaceholder: "例如：\n蝶阀100 110*45*82cm 8件 单重180kg 木箱\n纸箱B 60*40*35cm 30件 单重12kg\n易碎品C 55×45×30cm 12件 单重18kg 不可重压",
      recognitionSample: [
        "蝶阀100 110*45*82cm 8件 单重180kg 木箱",
        "蝶阀200 125*55*90cm 4件 总重960kg 木箱",
        "纸箱B 60*40*35cm 30件 单重12kg",
        "易碎品C 55×45×30cm 12件 单重18kg 不可重压",
        "电子产品配件 型号K 长48.5cm 宽15cm 高11.7cm 数量1 单重1.2kg 朝上",
        "",
        "cargo:",
        "E-Houses",
        "2 skids - each 31.200 kgs / 1080 x 200 x 340 cm",
        "3 skids - each 18.100 kgs / 660 x 200 x 340 cm",
        "2 skids - each 33.700 kgs / 1.210 x 230 x 340 cm"
      ].join("\n"),
      sampleLoadedMessage: "已填入示例文本，点击智能识别后会由后端流程提取中文和英文 skid 明细。"
    },
    planner: {
      priorityContainers: "参与计算箱型",
      priorityContainersHint: "本次搜索包含 {count} 个已选箱型；未设置价格的箱型只参与可装性计算",
      priorityCommon: "常用 GP/HQ",
      priorityAll: "全部箱型",
      containerScopeNote: "默认选择常用普柜/高柜；冷藏和平板属于特殊设备，按实际运输需求加入计算。",
      supportRatio: "可承重支撑比例",
      nonStackSupportRatio: "不可重压支撑比例",
      supportRatioTrace: "可承重 / 不可重压支撑阈值",
      supportConstraintNote: "如果货物不在箱底，下方必须由可承重货物的顶面覆盖达到当前配置的支撑比例，并通过中心/四角采样与四象限分布校验；不可重压货物不会作为上层支撑。",
      supportFormula: "上层支撑条件 = 面积覆盖率达标 + 关键落脚点有支撑 + 四象限不能集中悬空"
    },
    algorithmGuide: {
      eyebrow: "装箱策略图解",
      title: "当前计算如何从货物清单得到可视化方案",
      lanes: {
        prepare: {
          title: "预处理",
          text: "同规格货物先合并成搜索块，保留原始单件信息。"
        },
        base: {
          title: "五策略快跑",
          text: "每个箱型先用 5 种确定性顺序跑 LAFF + 极点，不做昂贵降级。"
        },
        refine: {
          title: "精修当前较优解",
          text: "选出当前箱型搜索到的较优基础解后，再做 4 件块到 2 件块、单件回填。"
        },
        stage: {
          title: "分阶段输出",
          text: "20GP、40GP、40HQ、20HQ 等常用箱先返回结果，冷藏和平板继续补算。"
        }
      },
      strategies: {
        footprint: {
          title: "LAFF 大底面积优先",
          text: "优先选择底面积大的货物作为层种子，让同层尽量密铺。"
        },
        height: {
          title: "LAFF 高度优先",
          text: "先处理高货，避免后期剩余空间无法容纳高件。"
        },
        support: {
          title: "可承重优先",
          text: "可承重货物先形成底层支撑面，减少悬空和支撑失败。"
        },
        nonstack: {
          title: "不可重压后放",
          text: "不可重压货物不作为上层支撑，尽量放到后续层或顶部。"
        },
        vertical: {
          title: "小件竖放补位",
          text: "对小件和特定颜色/类型货物尝试竖放，填补窄高空间。"
        }
      }
    },
    decisionFlow: {
      eyebrow: "决策流",
      title: "装箱决策播报",
      clear: "清空播报",
      calculating: "计算中",
      latest: "最近一次计算",
      waiting: "正在整理 Web Worker 决策流程...",
      empty: "暂无流程数据，点击“重新计算”后会显示关键决策。",
      broadcast: "决策关键流上下滚动播报",
      records: "条记录",
      recordCount: "{count} 条记录",
      recordTotal: "共 {count} 条记录",
      recordIndex: "第 {index} 条记录",
      currentDecision: "当前执行决策",
      currentProgress: "当前进度",
      progressTitle: "当前进度",
      progressHint: "计算、渲染与输出状态",
      calculateStage: "策略计算",
      renderStage: "3D 渲染",
      completeStage: "完成",
      renderKicker: "渲染中",
      renderMeta: "正在刷新可视化结果",
      renderText: "正在生成 3D 装箱视图...",
      renderingText: "正在生成 3D 装箱视图，完成后会显示当前搜索方案和货物坐标。",
      visualizing: "可视化视图",
      doneMeta: "本机计算已完成",
      doneText: "本机计算已完成，当前方案可以继续查看、导出或打印。",
      waitingTitle: "准备计算",
      waitingMeta: "正在准备本机装箱计算",
      elapsedTimer: "已用时 {value}",
      slowHint: "当前计算较慢，请耐心等待。",
      customerCurrentPlan: "当前方案",
      customerContainerMeta: "第 {index} 个箱型：{container}",
      containerCounter: "箱型进度 {current}/{total}",
      strategyCounter: "策略 {current}/{total}",
      remainingUnits: "剩余 {count} 个搜索单元",
      layerMeta: "第 {layer} 层",
      holdMeta: "第 {hold} 货舱",
      customerLoadingTitle: "货舱装箱计算",
      customerLayerPhase: "第 {layer} 层装箱",
      customerLayerText: "当前正在进行 {scope} 的货舱装箱计算 - 第 {layer} 层：{detail}",
      customerGenericText: "当前正在处理 {scope}：{detail}",
      customerOptimizingTitle: "空间利用优化",
      customerSupportTuningText: "正在优化 {scope} 的底层支撑和尾部空隙，尝试给上层货物提供更大的落脚面。",
      customerEvaluatingTitle: "箱型可装性评估",
      customerContainerText: "正在评估 {scope}，校验箱内尺寸、载重和可装性。",
      customerStrategyTitle: "装箱策略计算",
      customerStrategyText: "正在比较 {scope} 的装箱策略，寻找更稳、更满的摆放方式。",
      customerStrategyProgressText: "正在比较 {scope} 的装箱策略（第 {current}/{total} 个策略）：{detail}",
      customerSummaryTitle: "货舱结果汇总",
      customerHoldText: "正在汇总 {scope} 的第 {hold} 货舱结果：{detail}",
      customerBoxProgressText: "当前正在进行 {scope} 的第 {hold} 个货舱装箱计算，剩余 {remaining} 个搜索单元。",
      customerRecommendationText: "正在汇总当前搜索候选；全部约束合规后按综合参考运价排序。",
      customerPrepareTitle: "装箱数据准备",
      customerPrepareText: "正在整理货物、箱型和装箱规则，准备开始本机计算。",
      customerDetailFallback: "持续计算中",
      partialReadyText: "{scope} 的阶段结果已可查看，其他箱型继续在后台计算。",
      partialReadyMeta: "部分方案已可查看，当前搜索结果继续刷新中",
      status: {
        done: "已完成",
        active: "进行中",
        idle: "等待中"
      },
      steps: {
        start: {
          label: "准备数据",
          description: "读取货物、箱型与装箱参数"
        },
        prepare: {
          label: "块化预处理",
          description: "同规格货物先聚合，降低浏览器搜索压力"
        },
        container: {
          label: "箱型评估",
          description: "逐个箱型检查尺寸、载重与可装性"
        },
        strategy: {
          label: "策略搜索",
          description: "执行 LAFF、极点与多排序策略"
        },
        layer: {
          label: "分层装载",
          description: "单层密铺后换下一层继续堆叠"
        },
        repair: {
          label: "局部回填",
          description: "用小块和单件回填剩余空隙"
        },
        box: {
          label: "货舱汇总",
          description: "统计每个货舱装入件数和剩余货物"
        },
        recommendation: {
          label: "方案排序",
          description: "全部约束合规后，按综合参考运价、箱数和利用率排序"
        }
      }
    },
    packingTimeout: {
      eyebrow: "本机计算未完成",
      title: "装箱计算超时",
      status: "本机计算超时",
      lead: "浏览器本地 Worker 已达到本次计算等待上限，系统已停止继续占用本机算力；如已出现部分结果，可以先作为参考查看。",
      elapsed: "已运行",
      timeout: "等待上限",
      cargoScale: "货物规模",
      cargoScaleValue: "{types} 类 / {pieces} 件",
      containerScale: "箱型规模",
      containerScaleValue: "{count} 个箱型",
      decisionRecords: "决策记录",
      currentStatus: "当前状态",
      partialStatus: "部分结果可用",
      noFinalStatus: "未完成全部方案搜索",
      reasonTitle: "可能原因",
      reasonFallback: "本次货物或箱型组合较复杂，Worker 未能在前端等待时间内完成所有箱型和策略搜索。",
      lastDecisionTitle: "最后执行到",
      suggestionTitle: "建议处理",
      suggestionReduceContainers: "先减少参与计算的箱型数量，优先保留实际订舱候选箱型。",
      suggestionSplitCargo: "将大票货物按项目、目的港或装箱批次拆分后分别计算。",
      suggestionUsePartial: "如果页面已有常用箱型阶段结果，可先查看部分方案，再决定是否继续补算特殊箱型。",
      close: "关闭",
      adjust: "返回调整",
      retry: "重新计算"
    }
  },
  "en-US": {
    language: {
      label: "Language",
      chinese: "Chinese",
      english: "English"
    },
    app: {
      name: "Cargo Container Planning System",
      workspace: "Workspace",
      loadingAuth: "Checking login status..."
    },
    landing: {
      metaTitle: "DrewesLogistics · Drewes (Shanghai) Supply Chain Management Co., Ltd.",
      brandAria: "Return to the DrewesLogistics home page",
      loader: {
        aria: "DrewesLogistics platform is loading",
        copy: "Connecting the global freight workflow",
        skip: "Skip intro"
      },
      nav: {
        aria: "Home page navigation",
        home: "Home",
        capabilities: "Capabilities",
        features: "Platform features",
        tracking: "Cargo Tracking",
        roadmap: "Roadmap",
        about: "Company profile"
      },
      status: {
        available: "Available",
        public: "Public",
        publicFree: "Free & public",
        planned: "Planned"
      },
      entry: {
        enter: "Sign in",
        open: "Enter platform",
        admin: "Admin console"
      },
      hero: {
        explore: "Explore capabilities",
        signalEyebrow: "Transport signal",
        signalStatus: "Global route active",
        paginationAria: "Hero content navigation",
        goToSlide: "Go to slide {index}",
        previous: "Previous slide",
        next: "Next slide",
        slides: {
          platform: {
            kicker: "Digital operations for freight forwarders",
            title: "Make every shipment clear—from planning to delivery.",
            description: "DrewesLogistics brings smart load planning and shipment visibility into one entrance, with room to grow into schedules, booking, and ERP connectivity."
          },
          planning: {
            kicker: "Available · Smart load planning",
            title: "Turn loading experience into a plan teams can see and refine.",
            description: "Build loading plans from cargo and container data, with clear views of space, balance, and operational constraints.",
            action: "Open load planning"
          },
          tracking: {
            kicker: "Public service · Cargo Tracking",
            title: "Move from a reference number to the milestones that matter.",
            description: "Open shipment tracking without signing in and query carrier milestones by bill of lading, booking, or container number.",
            action: "Track cargo now"
          }
        }
      },
      capabilities: {
        aria: "DrewesLogistics platform capabilities",
        planning: {
          title: "Smart Load Planning",
          description: "Build 3D loading plans from cargo and container data, then review space, balance, and operating constraints.",
          action: "Sign in to use"
        },
        tracking: {
          title: "Shipment Visibility",
          description: "Bring carrier milestones together in a public view of current status, key dates, and route details.",
          action: "Track without signing in"
        },
        booking: {
          title: "Schedules & Booking",
          description: "Planned schedule search and booking assistance will reduce cross-platform lookup and repeated entry.",
          action: "View the roadmap"
        },
        erp: {
          title: "ERP Connectivity",
          description: "Planned standard interfaces will connect order, cargo, and shipment data into a continuous workflow.",
          action: "View the roadmap"
        },
        summary: {
          current: "Current capability",
          currentDetail: "Planning and tracking are ready",
          tracking: "Public tracking",
          trackingDetail: "Open directly without signing in"
        }
      },
      statement: {
        eyebrow: "One entrance · Clear boundaries",
        title: "Connect the tools in use today while leaving room for what comes next.",
        description: "DrewesLogistics keeps each module focused while presenting planning and tracking through one branded entrance. Cargo Tracking is public; enterprise workspaces and administration remain protected by sign-in and role checks.",
        track: "Track cargo publicly",
        metricOnline: "capabilities available",
        metricPublic: "public query service",
        metricRoadmap: "capabilities in scope"
      },
      company: {
        eyebrow: "COMPANY PROFILE · SHANGHAI",
        internationalName: "德鲁威斯（上海）供应链管理有限公司",
        legalName: "Drewes (Shanghai) Supply Chain Management Co., Ltd.",
        description: "Registered on March 16, 2023 in Hongkou District, Shanghai, the company focuses on supply chain management, international and domestic freight forwarding, ship agency, and transport equipment services.",
        detail: "Its registered scope includes supply chain management; international, ocean, air, and road freight forwarding; inspection declaration; international ship agency; domestic freight forwarding; equipment and vessel leasing; container sales; and NVOCC services.",
        incorporatedLabel: "Incorporated",
        typeLabel: "Entity type",
        typeValue: "Limited liability company (sole natural-person ownership)",
        industryLabel: "Registered industry",
        industryValue: "Business services",
        platformAction: "Explore platform capabilities",
        creditCodeLabel: "Unified social credit code",
        sourceNote: "Company details and scope are based on the public registration snapshot supplied by the user. Refer to the latest national enterprise credit record for changes.",
        operationsEyebrow: "SHANGHAI OPERATIONS",
        operationsTitle: "Transport coordination desk",
        operationsOrigin: "Shanghai execution",
        operationsHub: "Node coordination",
        operationsGlobal: "Global delivery",
        operationsStatus: "Multimodal route",
        servicesEyebrow: "PRIMARY BUSINESS",
        servicesTitle: "Connecting the critical steps across supply chain and freight forwarding.",
        servicesDescription: "Six primary activities distilled from the registered business scope, presented with clear service boundaries.",
        services: {
          oceanAir: {
            title: "Supply chain management",
            description: "Coordinate supply-chain activities around cargo flow and transport resources."
          },
          groundRail: {
            title: "Ocean freight forwarding",
            description: "Provide ocean international freight forwarding and related coordination."
          },
          project: {
            title: "Air & road freight forwarding",
            description: "Connect international air and road forwarding across transport modes."
          },
          warehouse: {
            title: "Ship agency & NVOCC",
            description: "Cover international ship agency and NVOCC services."
          },
          compliance: {
            title: "Domestic forwarding & inspection",
            description: "Provide domestic freight forwarding and inspection declaration support."
          },
          technology: {
            title: "Leasing & container services",
            description: "Cover transport equipment and vessel leasing, plus container sales."
          }
        }
      },
      roadmap: {
        eyebrow: "Product roadmap",
        title: "From focused tools to a connected freight workflow.",
        description: "We strengthen planning and tracking first, then connect schedules, booking, and ERP data according to real operating value—without promising unfinished features early.",
        currentLabel: "Current",
        currentTitle: "Load Planning · Shipment Tracking",
        currentDescription: "Load planning requires enterprise sign-in; Cargo Tracking is open as a public query service.",
        nextLabel: "Next",
        nextTitle: "Schedules & Booking · ERP",
        nextDescription: "Connect internal and external services around order and shipment data in practical stages.",
        viewWorkspaces: "View current workspaces"
      },
      cta: {
        eyebrow: "START WITH DrewesLogistics",
        title: "Start with one query and see a more connected freight operation.",
        description: "Public tracking needs no sign-in. Enterprise accounts and role checks protect load planning and administration.",
        publicTracking: "Open Cargo Tracking"
      },
      transition: {
        copy: "Opening the operations workspace",
        returnHome: "Returning to the DrewesLogistics home page"
      },
      footer: {
        tagline: "A modular digital operations platform for freight forwarders",
        signIn: "Enterprise sign in",
        quickLinks: "Quick links",
        registrationTitle: "Registration details",
        termLabel: "Operating term",
        termValue: "No fixed term",
        contactTitle: "Registration & address",
        registeredAddressLabel: "Registered address",
        registeredAddress: "7F, No. 137 Haining Road, Hongkou District, Shanghai (centralized registration address)",
        authorityLabel: "Registration authority",
        authority: "Hongkou District Market Supervision Administration",
        disclaimer: "Registration details may change. Refer to the latest National Enterprise Credit Information Publicity System record.",
        copyright: "© 2026 德鲁威斯（上海）供应链管理有限公司",
        platform: "Cargo Operations Suite"
      }
    },
    login: {
      brandPanelLabel: "Cargo planning platform overview",
      productLine: "Cargo Planning OS",
      kicker: "Intelligent container planning for global forwarding",
      heroTitle: "Turn every cubic metre into",
      heroAccent: "measurable transport efficiency",
      heroDescription: "Combining 3D packing, constraint recognition, and load-balance validation to give freight teams clear, dependable planning decisions.",
      capabilityPacking: "3D packing engine",
      capabilityBalance: "Balance and load checks",
      capabilityRules: "Constraint recognition",
      visualEyebrow: "PLANNING SIMULATION",
      visualTitle: "Intelligent load planning",
      visualStatus: "Live & ready",
      routeOrigin: "Origin",
      routeDestination: "Destination",
      metricSpace: "Space model",
      metricBalance: "Load check",
      metricConstraint: "Rule engine",
      engineOnline: "Planning engine online",
      releaseLabel: "Enterprise Release · 2026",
      secureAccess: "Secure enterprise access",
      formEyebrow: "ENTER WORKSPACE",
      formTitle: "Sign in to planning",
      formDescription: "Continue your container planning work with your enterprise account.",
      usernameLabel: "Account",
      usernamePlaceholder: "Enter your enterprise account",
      passwordLabel: "Password",
      passwordPlaceholder: "Enter your password",
      showPassword: "Show password",
      hidePassword: "Hide password",
      sessionNotice: "6-hour secure session",
      accountNotice: "Accounts are assigned by an administrator",
      signIn: "Secure sign in",
      signingIn: "Verifying identity...",
      securityNotice: "Protected by encrypted sessions and device policies",
      platformName: "Cargo Planning Platform",
      footerTagline: "Clarity for every load plan",
      errorFallback: "Sign-in failed. Check your account or password."
    },
    portal: {
      brandAria: "Return to workbench selection",
      productLine: "Cargo Operations Suite",
      systemReady: "Portal ready",
      adminConsole: "Admin console",
      logout: "Sign out",
      operator: "Operator",
      roleAdmin: "System administrator",
      roleEmployee: "Enterprise user",
      roleBusiness: "Business operator",
      greeting: "Hello, {name}. Choose today's workbench",
      heroDescription: "Load planning and shipment tracking now live in one business platform with a shared sign-in and fast workbench switching.",
      availableWorkbenches: "Workbenches",
      sharedIdentity: "Unified sign-in",
      operationCoverage: "Operational access",
      routePlanning: "Load planning",
      routeTracking: "Shipment tracking",
      sectionAria: "Available workbenches",
      sectionEyebrow: "SELECT A WORKBENCH",
      sectionTitle: "Enter a business workbench",
      sectionDescription: "Both workbenches share one entry point and sign-in while keeping clear business boundaries.",
      ready: "Ready",
      connected: "Connected",
      enterWorkbench: "Enter workbench",
      switchWorkbench: "Switch workbench",
      entering: "Opening workbench portal",
      enteringAdmin: "Opening administration console",
      footerHint: "One repository · One entry · Clear boundaries",
      planner: {
        label: "Load planning",
        title: "Cargo load planning workbench",
        description: "Define cargo and container constraints, run 3D packing, validate balance, and export the selected plan.",
        featurePacking: "3D packing",
        featureBalance: "Balance check",
        featureReport: "Plan export"
      },
      tracking: {
        label: "Shipment visibility",
        title: "Shipment tracking workbench",
        description: "Search by bill of lading, booking, or container number and review milestones and estimated arrival.",
        featureReferences: "Reference search",
        featureRoute: "Route milestones",
        featureChannels: "Dual channels"
      }
    },
    metrics: {
      spaceUtilization: "Space Utilization",
      deckUtilization: "Deck Utilization",
      currentBoxPieces: "Current container pieces",
      currentBoxVolume: "Current container volume",
      currentBoxSpaceUtilization: "Current container utilization",
      currentBoxDeckUtilization: "Current container deck utilization",
      currentBoxWeight: "Current container weight",
      boxProgress: "Container {current}/{total}",
      planAverageUtilization: "Plan avg. {value}%",
      currentBoxPlanHint: "Showing container {current} of {total}. The four metrics above apply only to this container; plan average utilization is {value}%.",
      lengthPercent: "Length {value}%",
      lengthSuffix: " · Length {value}%",
      deckUtilizationWithLength: "Deck utilization {value}%{length}"
    },
    sceneOptions: {
      showAxes: "Coordinate Axes",
      axisScale: "Axis Size",
      axisSmall: "Small",
      axisNormal: "Medium",
      axisLarge: "Large",
      loadBearing: "Load-bearing",
      nonStackable: "Non-stackable",
      keepUpright: "Keep Upright",
      clearanceEnvelope: "Clearance Envelope",
      physicalOuterSize: "Physical outer size (oriented)",
      reservedEnvelopeSize: "Reserved envelope (with gap)",
      horizontalGapDetail: "Horizontal net gap {gap} cm ({side} cm per side)",
      physicalCoordinates: "Physical coordinates",
      reservedCoordinates: "Envelope coordinates"
    },
    duration: {
      secondsShort: "{value}s",
      minutesShort: "{minutes}m",
      minutesSecondsShort: "{minutes}m {seconds}s"
    },
    packingStatus: {
      commonReady: "Common containers ready, special containers still running",
      partialReady: "Partial plan ready, other container types still running"
    },
    smartImport: {
      recognitionPlaceholder: [
        "Example:",
        "Valve A 110*45*82cm 8 pcs unit weight 180kg wooden crate",
        "Carton B 60*40*35cm 30 pcs unit weight 12kg",
        "Fragile C 55*45*30cm 12 pcs unit weight 18kg non-stackable"
      ].join("\n"),
      recognitionSample: [
        "Valve A 110*45*82cm 8 pcs unit weight 180kg wooden crate",
        "Valve B 125*55*90cm 4 pcs total weight 960kg wooden crate",
        "Carton B 60*40*35cm 30 pcs unit weight 12kg",
        "Fragile C 55*45*30cm 12 pcs unit weight 18kg non-stackable",
        "Electronic accessory model K length 48.5cm width 15cm height 11.7cm quantity 1 unit weight 1.2kg upright",
        "",
        "cargo:",
        "E-Houses",
        "2 skids - each 31.200 kgs / 1080 x 200 x 340 cm",
        "3 skids - each 18.100 kgs / 660 x 200 x 340 cm",
        "2 skids - each 33.700 kgs / 1.210 x 230 x 340 cm"
      ].join("\n"),
      sampleLoadedMessage: "Sample text inserted. Click Smart Recognition to let the backend extract the mixed cargo and skid details."
    },
    planner: {
      priorityContainers: "Containers Included in Calculation",
      priorityContainersHint: "This search includes {count} selected types; unpriced types are evaluated for fit only",
      priorityCommon: "Common GP/HQ",
      priorityAll: "All Containers",
      containerScopeNote: "Common dry and high-cube containers are selected by default; add reefer and flat-rack equipment only when the shipment requires them.",
      supportRatio: "Stackable Support Ratio",
      nonStackSupportRatio: "Non-stack Support Ratio",
      supportRatioTrace: "Stackable / Non-stack Support Thresholds",
      supportConstraintNote: "If cargo is not on the container floor, lower stackable surfaces must meet the configured support ratio and pass center/corner sampling plus quadrant distribution checks; non-stack cargo cannot support upper cargo.",
      supportFormula: "Support condition = area coverage passes + key landing points are supported + support is distributed across quadrants"
    },
    algorithmGuide: {
      eyebrow: "Packing Strategy Map",
      title: "How the calculator turns cargo lines into a visual plan",
      lanes: {
        prepare: {
          title: "Preprocess",
          text: "Identical cargo is grouped into solver blocks while original single-piece data is preserved."
        },
        base: {
          title: "Five Fast Strategies",
          text: "Each container first runs 5 deterministic LAFF + extreme-point orders without expensive downgrade."
        },
        refine: {
          title: "Refine the Better Current Candidate",
          text: "After a better base solution found for the current container is selected, 4-piece blocks downgrade to 2-piece blocks and then single-piece backfill."
        },
        stage: {
          title: "Stage Results",
          text: "Common 20GP, 40GP, 40HQ, and 20HQ results return first; reefer and flat-rack containers continue in the background."
        }
      },
      strategies: {
        footprint: {
          title: "LAFF Footprint First",
          text: "Large floor-footprint cargo becomes the layer seed so each layer can be packed densely."
        },
        height: {
          title: "LAFF Height First",
          text: "Tall cargo is considered early so later remaining spaces do not exclude it."
        },
        support: {
          title: "Support First",
          text: "Stackable cargo forms stable lower support surfaces before fragile cargo is considered."
        },
        nonstack: {
          title: "Non-stackable Last",
          text: "Non-stackable cargo cannot support upper cargo and is pushed toward later layers or the top."
        },
        vertical: {
          title: "Small Vertical Fill",
          text: "Small or marked cargo may be rotated upright to occupy narrow vertical gaps."
        }
      }
    },
    decisionFlow: {
      eyebrow: "Decision Flow",
      title: "Packing Decision Broadcast",
      clear: "Clear Broadcast",
      calculating: "Calculating",
      latest: "Latest Calculation",
      waiting: "Building the worker decision flow...",
      empty: "No flow data yet. Click Recalculate to show key decisions.",
      broadcast: "Vertical key-decision broadcast",
      records: "records",
      recordCount: "{count} records",
      recordTotal: "{count} records total",
      recordIndex: "Record {index}",
      currentDecision: "Current Decision",
      currentProgress: "Current Progress",
      progressTitle: "Current Progress",
      progressHint: "Calculation, rendering, and output status",
      calculateStage: "Strategy Calculation",
      renderStage: "3D Rendering",
      completeStage: "Complete",
      renderKicker: "Rendering",
      renderMeta: "Refreshing visualization",
      renderText: "Generating the 3D packing scene...",
      renderingText: "Generating the 3D packing scene. The current search plan and cargo coordinates will appear after rendering.",
      visualizing: "Visualization",
      doneMeta: "Local calculation completed",
      doneText: "Local calculation is complete. The current plan is ready to inspect, export, or print.",
      waitingTitle: "Preparing Calculation",
      waitingMeta: "Preparing the local packing calculation",
      elapsedTimer: "Elapsed {value}",
      slowHint: "This calculation is taking longer than usual. Please wait.",
      customerCurrentPlan: "Current plan",
      customerContainerMeta: "Container type {index}: {container}",
      containerCounter: "Container {current}/{total}",
      strategyCounter: "Strategy {current}/{total}",
      remainingUnits: "{count} search units remaining",
      layerMeta: "Layer {layer}",
      holdMeta: "Hold {hold}",
      customerLoadingTitle: "Hold Packing Calculation",
      customerLayerPhase: "Layer {layer} packing",
      customerLayerText: "Calculating hold packing for {scope} - layer {layer}: {detail}",
      customerGenericText: "Processing {scope}: {detail}",
      customerOptimizingTitle: "Space Utilization Optimization",
      customerSupportTuningText: "Optimizing lower support and tail gaps for {scope} to create more landing area for upper cargo.",
      customerEvaluatingTitle: "Container Loadability Check",
      customerContainerText: "Evaluating {scope}: checking internal dimensions, payload, and loadability.",
      customerStrategyTitle: "Packing Strategy Calculation",
      customerStrategyText: "Comparing packing strategies for {scope} to find a more stable and fuller layout.",
      customerStrategyProgressText: "Comparing packing strategies for {scope} (strategy {current}/{total}): {detail}",
      customerSummaryTitle: "Hold Result Summary",
      customerHoldText: "Summarizing hold {hold} for {scope}: {detail}",
      customerBoxProgressText: "Calculating hold {hold} for {scope}; {remaining} search units remain.",
      customerRecommendationText: "Summarizing current search candidates and ranking by composite reference freight after all constraints pass.",
      customerPrepareTitle: "Packing Data Preparation",
      customerPrepareText: "Preparing cargo, container types, and packing rules before local calculation starts.",
      customerDetailFallback: "Calculation is still running",
      partialReadyText: "The stage result for {scope} is ready to inspect while other container types continue in the background.",
      partialReadyMeta: "Partial plans are ready; the current search result keeps updating",
      status: {
        done: "Done",
        active: "Running",
        idle: "Waiting"
      },
      steps: {
        start: {
          label: "Prepare Data",
          description: "Read cargo, container types, and packing parameters"
        },
        prepare: {
          label: "Block Preprocessing",
          description: "Group identical cargo first to reduce browser search load"
        },
        container: {
          label: "Container Evaluation",
          description: "Check dimensions, payload, and loadability by container"
        },
        strategy: {
          label: "Strategy Search",
          description: "Run LAFF, extreme points, and multiple sort strategies"
        },
        layer: {
          label: "Layered Packing",
          description: "Fill one layer densely, then continue on the next layer"
        },
        repair: {
          label: "Local Backfill",
          description: "Backfill remaining gaps with smaller blocks and single pieces"
        },
        box: {
          label: "Hold Summary",
          description: "Summarize loaded pieces and remaining cargo by hold"
        },
        recommendation: {
          label: "Plan Ranking",
          description: "After all constraints pass, rank by composite reference freight, container count, and utilization"
        }
      }
    },
    packingTimeout: {
      eyebrow: "Local Calculation Incomplete",
      title: "Packing Calculation Timed Out",
      status: "Local calculation timed out",
      lead: "The browser Web Worker reached the waiting limit for this calculation, so the app stopped using local compute. If partial results are already shown, you can review them as a reference.",
      elapsed: "Elapsed",
      timeout: "Wait Limit",
      cargoScale: "Cargo Scale",
      cargoScaleValue: "{types} types / {pieces} pcs",
      containerScale: "Container Scale",
      containerScaleValue: "{count} container types",
      decisionRecords: "Decision Records",
      currentStatus: "Current Status",
      partialStatus: "Partial results available",
      noFinalStatus: "Full plan search not completed",
      reasonTitle: "Likely Reason",
      reasonFallback: "This cargo/container combination is complex, and the Worker did not finish all container and strategy searches within the frontend wait limit.",
      lastDecisionTitle: "Last Reached Step",
      suggestionTitle: "Suggested Next Steps",
      suggestionReduceContainers: "Reduce the container types included in the calculation and keep only realistic booking candidates first.",
      suggestionSplitCargo: "Split large shipments by project, destination, or loading batch before recalculating.",
      suggestionUsePartial: "If common-container stage results are already visible, review the partial plan before deciding whether to continue special-container calculation.",
      close: "Close",
      adjust: "Adjust Setup",
      retry: "Recalculate"
    }
  }
};

Object.assign(messages["zh-CN"].login, {
  routeLabel: "选择登录方式",
  employeeRoute: "企业内部员工",
  employeeRouteHint: "工号 + 密码",
  customerRoute: "客户码登录",
  customerRouteHint: "直达货物追踪",
  employeeNumberLabel: "工号",
  employeeNumberPlaceholder: "请输入企业工号",
  customerEyebrow: "CUSTOMER TRACKING ACCESS",
  customerTitle: "使用客户码进入货物追踪",
  customerDescription: "客户码由您的业务员分配，仅可访问已明确关联给您的票单与双方文件。",
  customerCodeLabel: "客户码",
  customerCodePlaceholder: "请输入业务员提供的客户码",
  customerSessionNotice: "独立客户安全会话",
  customerAccountNotice: "查询成功不会自动获得票单权限",
  customerSignIn: "登录并打开追踪",
  customerSigningIn: "正在验证客户码...",
  customerSuccess: "客户身份验证成功，货物追踪已在新页面打开。",
  customerPopupBlocked: "客户身份验证成功。浏览器阻止了新页面，请允许弹窗后重试。",
  customerErrorFallback: "客户码验证失败，请确认客户码仍然有效。",
  customerTrackingSameOrigin: "客户登录态要求货物追踪与门户同域部署，请检查 VITE_TRACKING_WORKBENCH_URL。"
});

Object.assign(messages["en-US"].login, {
  routeLabel: "Choose a sign-in route",
  employeeRoute: "Internal employee",
  employeeRouteHint: "Employee No. + password",
  customerRoute: "Customer code",
  customerRouteHint: "Go straight to tracking",
  employeeNumberLabel: "Employee number",
  employeeNumberPlaceholder: "Enter your employee number",
  customerEyebrow: "CUSTOMER TRACKING ACCESS",
  customerTitle: "Open tracking with a customer code",
  customerDescription: "Your operator issues the code. It only grants access to shipments and shared files explicitly assigned to you.",
  customerCodeLabel: "Customer code",
  customerCodePlaceholder: "Enter the code provided by your operator",
  customerSessionNotice: "Separate customer session",
  customerAccountNotice: "A successful search never grants file access",
  customerSignIn: "Sign in and open tracking",
  customerSigningIn: "Verifying customer code...",
  customerSuccess: "Customer access verified. Tracking opened in a new page.",
  customerPopupBlocked: "Customer access was verified, but the browser blocked the new page. Allow pop-ups and retry.",
  customerErrorFallback: "Customer-code verification failed. Check that the code is still active.",
  customerTrackingSameOrigin: "Customer sessions require tracking and the portal to share an origin. Check VITE_TRACKING_WORKBENCH_URL."
});

Object.assign(messages["zh-CN"].portal, {
  customerWorkspace: "客户与票单",
  controlled: "显式授权",
  customers: {
    label: "客户协作",
    title: "客户与票单权限工作台",
    description: "分配独立客户码，并将客户明确绑定到指定票单；查询本身不会授予文件权限。",
    featureCodes: "一次性客户码",
    featureRoles: "货运身份",
    featureBindings: "票单绑定"
  }
});

Object.assign(messages["en-US"].portal, {
  customerWorkspace: "Customers & shipments",
  controlled: "Explicit access",
  customers: {
    label: "Customer collaboration",
    title: "Customer and shipment access",
    description: "Issue separate customer codes and explicitly assign shipment access; searching never grants file permissions.",
    featureCodes: "One-time codes",
    featureRoles: "Freight identities",
    featureBindings: "Shipment assignment"
  }
});

messages["zh-CN"].customers = {
  productLine: "客户访问控制",
  internalPartyAgent: "内部身份 · 代理 AGENT",
  businessOperator: "业务员",
  logout: "退出",
  eyebrow: "CUSTOMER ACCESS CONTROL",
  title: "把每一票货物，明确交给正确的客户。",
  description: "客户码是独立于员工账号的登录凭证。业务员负责创建客户、定义货运身份，并显式维护客户可访问的票单。",
  boundaryTitle: "权限边界已收紧",
  boundaryDescription: "客户只有在票单被绑定后才能访问双方文件；公开追踪查询不会建立授权关系。",
  createTitle: "创建客户",
  createDescription: "客户码只在创建成功后显示一次。",
  username: "客户登录名",
  usernamePlaceholder: "例如 acme-shanghai",
  displayName: "客户名称",
  displayNamePlaceholder: "例如 ACME 上海采购部",
  partyRole: "货运身份",
  roleAgent: "代理 · AGENT",
  roleShipper: "发货人 · SHIPPER",
  roleConsignee: "收货人 · CONSIGNEE",
  create: "创建并生成客户码",
  creating: "正在创建...",
  directoryEyebrow: "CUSTOMER DIRECTORY",
  directoryTitle: "客户目录",
  loading: "正在加载客户...",
  emptyCustomers: "还没有客户，请先创建一个。",
  selectTitle: "选择一个客户",
  selectDescription: "在左侧选择客户后，可编辑资料并维护其票单访问范围。",
  detailEyebrow: "CUSTOMER PROFILE",
  resetCode: "重置客户码",
  deactivate: "停用客户",
  reactivate: "重新启用",
  profileTitle: "客户资料与物流身份",
  profileDescription: "系统角色与货运身份分别维护。",
  saveProfile: "保存资料",
  codePrefix: "客户码标识",
  codePrefixHint: "仅用于核对；完整客户码不会再次显示。",
  notAvailable: "未提供",
  shipmentsTitle: "已授权票单",
  shipmentsDescription: "优先按承运人与订舱号或提单号绑定；系统记录 ID 仅作为高级备用入口。",
  bindMode: "选择票单绑定方式",
  bindByReference: "按承运人与单号",
  bindByShipmentId: "按系统记录 ID",
  shipmentId: "系统货运记录 ID",
  shipmentIdPlaceholder: "粘贴查询结果中的系统记录 ID",
  shipmentIdHint: "这是平台自动生成的唯一 UUID，不是订舱号、提单号、箱号或客户订单号。",
  referenceHint: "请先在货运追踪工作台查询并确认属于自己的业务票单，再在这里授权给客户。",
  carrier: "承运人",
  carrierPlaceholder: "例如 COSCO",
  referenceType: "单号类型",
  referenceBooking: "订舱号",
  referenceBill: "提单号",
  referenceContainer: "箱号",
  referenceUnknown: "业务单号",
  referenceNo: "业务单号",
  referenceNoPlaceholder: "输入订舱号或提单号",
  bind: "绑定票单",
  binding: "正在绑定...",
  shipmentReference: "票单",
  shipmentStatus: "追踪状态",
  assignedAt: "授权时间",
  actions: "操作",
  loadingShipments: "正在加载已授权票单...",
  emptyShipments: "尚未绑定票单。客户可以公开查询，但无法访问相关文件。",
  bound: "已绑定",
  unbind: "解除绑定",
  statusActive: "正常",
  statusDisabled: "已停用",
  codeDialogTitle: "立即保存客户码",
  codeDialogDescription: "这是 {name} 的完整客户码，关闭后系统不会再次展示。",
  codeDialogWarning: "请通过可信渠道发送给客户。重置客户码会立即撤销旧码和旧客户会话。",
  copyCode: "复制客户码",
  copied: "已复制",
  confirmStored: "我已安全保存",
  resetConfirm: "重置后旧客户码及现有客户会话将立即失效，确认继续？",
  deactivateConfirm: "停用后该客户将无法登录，确认继续？",
  unbindConfirm: "解除后客户将立即失去该票双方文件的访问权限，确认继续？",
  saved: "客户资料已更新。",
  deactivated: "客户已停用。",
  reactivated: "客户已重新启用。",
  boundSuccess: "票单已明确授权给该客户。",
  unboundSuccess: "票单授权已解除。",
  loadFailed: "客户列表加载失败。",
  loadShipmentsFailed: "票单授权列表加载失败。",
  createFailed: "客户创建失败。",
  saveFailed: "客户资料保存失败。",
  resetFailed: "客户码重置失败。",
  deactivateFailed: "客户停用失败。",
  reactivateFailed: "客户重新启用失败。",
  bindFailed: "票单绑定失败，请检查 publicId 或承运人和单号是否存在。",
  trackedShipmentNotFound: "未找到已追踪货物。请先进入货运追踪工作台查询并确认这是你的业务票单，再返回绑定。",
  shipmentAccessRequired: "这张票单不在你的业务权限范围内，不能绑定给客户。请先确认票单归属或联系管理员授权。",
  unbindFailed: "票单解绑失败。"
};

messages["en-US"].customers = {
  productLine: "Customer Access Control",
  internalPartyAgent: "Internal identity · AGENT",
  businessOperator: "Business operator",
  logout: "Sign out",
  eyebrow: "CUSTOMER ACCESS CONTROL",
  title: "Put every shipment in the right customer's hands.",
  description: "Customer codes are separate from employee accounts. Operators create customers, define freight identities, and explicitly maintain each customer's shipment scope.",
  boundaryTitle: "A deliberate access boundary",
  boundaryDescription: "Customers can access shared files only after assignment. A public tracking search never creates authorization.",
  createTitle: "Create customer",
  createDescription: "The full customer code is shown once after creation.",
  username: "Customer login name",
  usernamePlaceholder: "e.g. acme-shanghai",
  displayName: "Customer name",
  displayNamePlaceholder: "e.g. ACME Shanghai Purchasing",
  partyRole: "Freight identity",
  roleAgent: "Agent · AGENT",
  roleShipper: "Shipper · SHIPPER",
  roleConsignee: "Consignee · CONSIGNEE",
  create: "Create and issue code",
  creating: "Creating...",
  directoryEyebrow: "CUSTOMER DIRECTORY",
  directoryTitle: "Customer directory",
  loading: "Loading customers...",
  emptyCustomers: "No customers yet. Create the first one above.",
  selectTitle: "Select a customer",
  selectDescription: "Select a customer to edit their profile and maintain shipment access.",
  detailEyebrow: "CUSTOMER PROFILE",
  resetCode: "Reset customer code",
  deactivate: "Deactivate customer",
  reactivate: "Reactivate",
  profileTitle: "Profile and freight identity",
  profileDescription: "System roles and freight identities are maintained separately.",
  saveProfile: "Save profile",
  codePrefix: "Code identifier",
  codePrefixHint: "For verification only; the full customer code is never displayed again.",
  notAvailable: "Not available",
  shipmentsTitle: "Authorized shipments",
  shipmentsDescription: "Prefer carrier plus booking or bill-of-lading number. The system record ID is an advanced fallback.",
  bindMode: "Choose shipment assignment mode",
  bindByReference: "By carrier & reference",
  bindByShipmentId: "By system record ID",
  shipmentId: "System shipment record ID",
  shipmentIdPlaceholder: "Paste the system record ID from tracking",
  shipmentIdHint: "This is a platform-generated UUID, not a booking, bill-of-lading, container, customer-order, or forwarder job number.",
  referenceHint: "Track and verify that the shipment belongs to your business before assigning customer access here.",
  carrier: "Carrier",
  carrierPlaceholder: "e.g. COSCO",
  referenceType: "Reference type",
  referenceBooking: "Booking number",
  referenceBill: "Bill of lading",
  referenceContainer: "Container number",
  referenceUnknown: "Business reference",
  referenceNo: "Reference number",
  referenceNoPlaceholder: "Enter a booking or bill-of-lading number",
  bind: "Assign shipment",
  binding: "Assigning...",
  shipmentReference: "Shipment",
  shipmentStatus: "Tracking status",
  assignedAt: "Assigned at",
  actions: "Actions",
  loadingShipments: "Loading authorized shipments...",
  emptyShipments: "No shipments assigned. The customer may use public tracking but cannot access related files.",
  bound: "Assigned",
  unbind: "Remove access",
  statusActive: "Active",
  statusDisabled: "Disabled",
  codeDialogTitle: "Save this customer code now",
  codeDialogDescription: "This is the complete customer code for {name}. It will not be shown again after closing.",
  codeDialogWarning: "Share it through a trusted channel. Resetting the code immediately revokes the old code and active customer sessions.",
  copyCode: "Copy customer code",
  copied: "Copied",
  confirmStored: "I stored it safely",
  resetConfirm: "The old code and active customer sessions will be revoked immediately. Continue?",
  deactivateConfirm: "This customer will no longer be able to sign in. Continue?",
  unbindConfirm: "The customer will immediately lose access to shared files for this shipment. Continue?",
  saved: "Customer profile updated.",
  deactivated: "Customer deactivated.",
  reactivated: "Customer reactivated.",
  boundSuccess: "Shipment explicitly assigned to this customer.",
  unboundSuccess: "Shipment access removed.",
  loadFailed: "Could not load customers.",
  loadShipmentsFailed: "Could not load shipment access.",
  createFailed: "Could not create the customer.",
  saveFailed: "Could not save the customer profile.",
  resetFailed: "Could not reset the customer code.",
  deactivateFailed: "Could not deactivate the customer.",
  reactivateFailed: "Could not reactivate the customer.",
  bindFailed: "Could not assign the shipment. Check the publicId or carrier and reference.",
  trackedShipmentNotFound: "No tracked shipment was found. Track it in the shipment workbench and verify it belongs to your business before assigning it here.",
  shipmentAccessRequired: "This shipment is outside your business access scope and cannot be assigned. Verify ownership or ask an administrator to grant access.",
  unbindFailed: "Could not remove shipment access."
};

messages["zh-CN"].admin = {
  employee: {
    partyRole: "货运身份",
    edit: "编辑",
    editTitle: "编辑内部账号",
    createTitle: "新增内部账号",
    agentForcedHint: "BUSINESS 与 ADMIN 属于内部代理角色，货运身份固定为 AGENT。",
    save: "保存账号",
    create: "创建员工",
    saved: "内部账号已更新。",
    created: "内部账号已创建。",
    empty: "暂无内部账号。",
    usernamePlaceholder: "例如 zhangsan",
    initialPassword: "初始密码",
    passwordPlaceholder: "至少 12 位，含大小写字母、数字和符号",
    resetPassword: "重置密码",
    selfResetDisabled: "为防止当前管理员被锁定，不能在此重置自己的密码。",
    resetPasswordConfirm: "确认重置账号“{username}”的密码吗？系统会生成一次性临时密码，并让该账号已登录设备下线。",
    resetPasswordSuccess: "账号 {username} 的密码已安全重置。",
    temporaryPasswordTitle: "立即保存重置密码",
    temporaryPasswordDescription: "这是账号 {username} 的新重置密码；出于安全考虑，关闭后系统不会再次显示。",
    temporaryPasswordWarning: "请通过可信渠道交给员工。该密码会持续有效，直到管理员再次修改或重置。",
    copyTemporaryPassword: "复制临时密码",
    temporaryPasswordCopied: "已复制",
    temporaryPasswordStored: "我已安全保存",
    temporaryPasswordMissing: "服务端未返回临时密码，请重试或检查部署版本。",
    copyTemporaryPasswordFailed: "复制失败，请手动选择临时密码。",
    errorTitle: "操作未完成",
    errorConfirm: "知道了",
    errorFallback: "操作失败，请检查输入后重试。"
  }
};

messages["en-US"].admin = {
  employee: {
    partyRole: "Freight identity",
    edit: "Edit",
    editTitle: "Edit internal account",
    createTitle: "Create internal account",
    agentForcedHint: "BUSINESS and ADMIN are internal operator roles, so their freight identity is fixed to AGENT.",
    save: "Save account",
    create: "Create employee",
    saved: "Internal account updated.",
    created: "Internal account created.",
    empty: "No internal accounts yet.",
    usernamePlaceholder: "e.g. zhangsan",
    initialPassword: "Initial password",
    passwordPlaceholder: "At least 12 characters with upper, lower, digit, and symbol",
    resetPassword: "Reset password",
    selfResetDisabled: "You cannot reset your own password here because it would lock the active administrator session.",
    resetPasswordConfirm: "Reset the password for account “{username}”? A one-time temporary password will be generated and all active sessions for the account will be revoked.",
    resetPasswordSuccess: "Password for account {username} was reset securely.",
    temporaryPasswordTitle: "Save the reset password now",
    temporaryPasswordDescription: "This is the new reset password for {username}. For security, it will not be shown again after this dialog closes.",
    temporaryPasswordWarning: "Share it through a trusted channel. It remains valid until an administrator changes or resets it again.",
    copyTemporaryPassword: "Copy temporary password",
    temporaryPasswordCopied: "Copied",
    temporaryPasswordStored: "I stored it safely",
    temporaryPasswordMissing: "The server did not return a temporary password. Retry or verify the deployed backend version.",
    copyTemporaryPasswordFailed: "Copy failed. Select and copy the temporary password manually.",
    errorTitle: "Operation not completed",
    errorConfirm: "OK",
    errorFallback: "The operation failed. Check the input and try again."
  }
};

messages["zh-CN"].homeOptions = {
  workspace: "工作台",
  packing: "装箱计算",
  smartImport: "智能导入"
};

messages["en-US"].homeOptions = {
  workspace: "Workspace",
  packing: "Packing Calculation",
  smartImport: "Smart Import"
};
