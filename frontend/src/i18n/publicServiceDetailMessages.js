// Public descriptions reflect the available workflow, rather than service-level promises.
const details = {
  transport: {
    zh: {
      overview: [
        "运输进度的判断，始于可靠的查询依据。选择承运人与参考号类型后，平台将可获得的运输事件、航线和时间信息组织在一起，方便业务人员与客户围绕同一票货物沟通。",
        "预计时间会随运输安排变化。查看结果时，可以结合实际事件、查询来源与更新时间复核进度，再决定是否联系承运人或继续跟进相关票单。"
      ],
      deliverables: [
        ["运输事件记录", "按查询结果查看可获得的运输节点，区分实际发生的事件与预计安排。"],
        ["航线与时间依据", "汇总承运人返回的港口、运输与时间信息，支持后续业务核对。"],
        ["后续跟进入口", "从运输信息继续进入获授权的业务和文件上下文，减少重复查找。"]
      ],
      scenarios: [
        ["日常进度跟进", "业务人员在回复客户之前，先核对对应单号的最新查询结果。"],
        ["收货安排前复核", "客户根据预计时间和已发生事件，判断是否需要进一步确认后续安排。"]
      ],
      faq: [
        [
          "为什么暂时没有查询结果？",
          "请先核对承运人、单号类型和号码。结果还取决于承运人是否已提供相应数据；没有返回的事件不会被推断为已完成。"
        ],
        [
          "预计到达时间可以作为交付承诺吗？",
          "预计时间是当前查询信息的一部分，会随运输安排变化。关键作业安排请向对应业务联系人或承运人复核。"
        ]
      ]
    },
    en: {
      overview: [
        "Useful shipment visibility starts with a traceable query. Select a carrier and reference type to bring the available transport events, routing and time information into one view for shipment conversations.",
        "Estimates can change as transport arrangements evolve. Review actual events alongside the query source and update time, then decide whether to contact the carrier or follow up in the shipment workspace."
      ],
      deliverables: [
        [
          "Transport event record",
          "Review returned milestones and distinguish actual events from estimated arrangements."
        ],
        [
          "Routing and time context",
          "Check the available ports, transport details and timestamps supplied by the carrier."
        ],
        [
          "A next step for follow-up",
          "Continue into authorized business and document contexts when available."
        ]
      ],
      scenarios: [
        [
          "Daily shipment follow-up",
          "Check the reference and latest returned information before responding to a customer."
        ],
        [
          "Preparing for receipt",
          "Use estimates and actual events to identify the arrangements that need confirmation."
        ]
      ],
      faq: [
        [
          "Why is there no result yet?",
          "Check the carrier, reference type and number. Availability also depends on the carrier's data. Missing events are never assumed to be complete."
        ],
        [
          "Is an estimated arrival a delivery commitment?",
          "It is an estimate in the current query and can change. Confirm critical operational arrangements with the responsible contact or carrier."
        ]
      ]
    }
  },
  planning: {
    zh: {
      overview: [
        "装箱规划把货物清单转化为可讨论、可复核的装载方案。将尺寸、重量、件数与摆放限制整理完整，再结合箱型参数进行计算，提前看清空间使用与货物摆放。",
        "三维视图帮助团队观察货物之间的关系，报告帮助执行人员理解方案。计算结果需要结合实际包装、设备状况和现场操作条件确认后使用。"
      ],
      deliverables: [
        ["结构化货物清单", "汇总每类货物的尺寸、重量与数量，为本次计算保留统一输入。"],
        ["三维装载方案", "查看候选箱型、货物位置和摆放结果，从多个视角复核装载安排。"],
        ["可导出的方案资料", "导出装载示意、货物清单与方案报告，用于内部沟通和装载前确认。"]
      ],
      scenarios: [
        ["出运前的箱型判断", "对比货物与候选设备，提前发现尺寸、载荷或堆叠方面的限制。"],
        ["仓库与业务共同复核", "围绕三维摆放和清单讨论方案，减少仅凭体积估算带来的理解偏差。"]
      ],
      faq: [
        [
          "需要准备哪些货物资料？",
          "请准备长、宽、高、单件重量、数量及包装信息，并确认允许旋转、堆叠和承重等限制。尺寸与重量单位应保持一致。"
        ],
        [
          "计算方案能否直接替代现场装载确认？",
          "不能。方案用于规划与复核，实际装载仍需确认包装、绑扎、设备可用尺寸、受力和现场安全条件。"
        ]
      ]
    },
    en: {
      overview: [
        "Load planning turns a cargo list into an arrangement the team can inspect. Prepare dimensions, weight, quantities and orientation limits, then calculate against container parameters to review space and placement.",
        "The 3D view makes spatial relationships visible; exported reports help communicate the arrangement. Check the calculated plan against packaging, actual equipment and site conditions before execution."
      ],
      deliverables: [
        [
          "Structured cargo input",
          "Keep dimensions, unit weights and quantities together for the calculation."
        ],
        [
          "A 3D loading arrangement",
          "Inspect cargo positions and candidate equipment from different viewpoints."
        ],
        [
          "Exportable planning material",
          "Share illustrations, cargo lists and reports for review before loading."
        ]
      ],
      scenarios: [
        [
          "Equipment selection before shipment",
          "Identify dimensions, load or stacking constraints while comparing cargo with candidate containers."
        ],
        [
          "Warehouse and business review",
          "Discuss the 3D arrangement and list together instead of relying on total volume alone."
        ]
      ],
      faq: [
        [
          "What cargo information is needed?",
          "Prepare dimensions, unit weight, quantity and packaging, plus orientation, stacking and load restrictions. Keep units consistent."
        ],
        [
          "Does the calculation replace a site loading check?",
          "No. Confirm packaging, securing, actual usable dimensions, load distribution and safe site conditions before loading."
        ]
      ]
    }
  },
  containers: {
    zh: {
      overview: [
        "箱型资料将常见设备参数放在同一参考体系中，方便在货物录入、装载规划和业务沟通之间核对设备条件。查看内尺寸、容积与载荷，理解不同箱型的可用空间。",
        "参考参数用于前期判断，不能替代实际设备确认。遇到超高、超宽、冷藏或其他特殊要求时，应结合承运人资料和放箱设备逐项复核。"
      ],
      deliverables: [
        ["设备参数参考", "查阅常用箱型的尺寸、容积及载荷等基础资料。"],
        ["选型核对依据", "区分标准干货箱、高柜与特殊设备，在规划前确认限制。"],
        ["来源与使用说明", "阅读参数来源和说明，识别需要进一步确认的设备条件。"]
      ],
      scenarios: [
        ["录入货物前核对箱型", "先了解候选设备的边界，再准备对应的装载参数。"],
        ["特殊货物沟通", "明确关注内高、开口、载荷或特殊设备条件，便于与承运人沟通。"]
      ],
      faq: [
        [
          "资料中的尺寸就是实际可用尺寸吗？",
          "不同制造批次和设备状态可能存在差异。请以承运人提供的信息及实际设备为准。"
        ],
        [
          "是否可以只按总体积选择箱型？",
          "还应核对单件尺寸、包装、重量分布、装卸方式及堆叠限制，再进入装箱规划复核。"
        ]
      ]
    },
    en: {
      overview: [
        "Equipment reference brings common container parameters together for cargo preparation, planning and business discussions. Review internal dimensions, capacity and payload to understand the space each type provides.",
        "Reference parameters support an initial assessment. Confirm actual released equipment and carrier specifications, especially for overheight, overwidth, temperature-controlled or other special cargo."
      ],
      deliverables: [
        [
          "Equipment parameters",
          "Review dimensions, volume and payload for common container types."
        ],
        [
          "A selection checklist",
          "Distinguish dry, high-cube and special equipment before planning."
        ],
        ["Source and usage notes", "Identify which equipment conditions need further confirmation."]
      ],
      scenarios: [
        [
          "Before cargo preparation",
          "Understand candidate equipment limits before configuring a loading plan."
        ],
        [
          "Special-cargo discussions",
          "Identify questions about internal height, openings, payload or equipment constraints."
        ]
      ],
      faq: [
        [
          "Are reference dimensions the actual usable dimensions?",
          "Manufacturing batches and equipment conditions can differ. Use carrier information and the actual equipment for confirmation."
        ],
        [
          "Can I select a container by total volume alone?",
          "Also review item dimensions, packaging, weight distribution, handling and stacking constraints in load planning."
        ]
      ]
    }
  },
  booking: {
    zh: {
      overview: [
        "订舱入口为需要继续办理订舱的用户提供清楚的外部平台路径。进入前可确认目标地址与账号准备情况，再在独立平台内完成其提供的业务流程。",
        "当前官网负责提供入口说明。订舱资料、可用功能和办理结果由独立平台提供，使用该平台自己的账号与访问规则。"
      ],
      deliverables: [
        ["明确的平台入口", "展示独立订舱平台地址，并在新窗口中打开。"],
        ["访问准备说明", "在离开官网前了解独立登录与账号要求。"],
        ["业务衔接路径", "完成运输查询与装载准备后，可继续前往订舱平台办理。"]
      ],
      scenarios: [
        ["已有订舱账号", "从常用服务入口进入平台，按平台要求准备并填写资料。"],
        ["出运准备阶段", "先核对货物与设备条件，再衔接独立订舱流程。"]
      ],
      faq: [
        [
          "可以使用本站账号直接登录订舱平台吗？",
          "订舱平台需要独立登录。本站不会向外部地址传递当前账号的密码或会话信息。"
        ],
        [
          "在哪里确认订舱结果？",
          "请在独立平台中查看其返回的结果，并按实际业务联系渠道核实。官网入口不代表订舱已提交或已确认。"
        ]
      ]
    },
    en: {
      overview: [
        "The booking entry provides a clear route to the independent platform. Review the destination and account requirements, then continue with the business workflow available there.",
        "This website supplies entry guidance. Booking details, available features and outcomes belong to the independent platform and follow its own account and access rules."
      ],
      deliverables: [
        [
          "An identified destination",
          "Review the external address and open it in a separate window."
        ],
        ["Access preparation", "Understand the separate sign-in requirement before continuing."],
        [
          "A connected workflow",
          "Move from transport and loading preparation to the booking platform."
        ]
      ],
      scenarios: [
        [
          "Existing booking users",
          "Open the platform and prepare the information requested there."
        ],
        [
          "Preparing a shipment",
          "Review cargo and equipment conditions before continuing with a booking."
        ]
      ],
      faq: [
        [
          "Can my website account sign in to booking?",
          "The booking platform requires its own sign-in. This website does not pass your password or current session to it."
        ],
        [
          "Where is a booking confirmed?",
          "Check the independent platform's returned outcome and confirm through your business contact. Opening the link does not submit or confirm a booking."
        ]
      ]
    }
  },
  operations: {
    zh: {
      overview: [
        "业务概览为每天的跟进提供一个起点。将新增、更新与运输状态放在业务背景中查看，先找到需要关注的票单，再进入对应页面处理。",
        "概览连接客户目录、代理与票单工作区。可见内容随账号权限而定，帮助不同角色在各自业务范围内组织日常工作。"
      ],
      deliverables: [
        ["业务活动概览", "查看可访问范围内的新增与更新活动，定位最近变化。"],
        ["状态跟进线索", "结合运输状态与趋势，为当天的业务跟进安排顺序。"],
        ["关联工作区入口", "从概览继续进入客户与票单页面，查看完整业务上下文。"]
      ],
      scenarios: [
        ["每日工作开始时", "快速浏览业务变化，找到需要核对资料或继续刷新状态的票单。"],
        ["业务回顾与跟进", "结合关联对象查看变化，再由负责人员推进下一步工作。"]
      ],
      faq: [
        [
          "为什么不同账号看到的概览不同？",
          "概览沿用账号的业务权限与可访问范围。请以实际登录后展示的对象和可用模块为准。"
        ],
        [
          "概览是否可以直接修改全部业务？",
          "概览用于定位业务。具体维护操作需要进入相应工作区，并满足该页面的账号权限。"
        ]
      ]
    },
    en: {
      overview: [
        "Operations overview is a starting point for daily follow-up. Review new activity, updates and transport status in context, find the shipment that needs attention, then open its workspace.",
        "The overview connects customer, agent and shipment work. What appears follows account permissions so each role can organize work within its own business scope."
      ],
      deliverables: [
        [
          "Business activity overview",
          "Locate recent creations and updates within the accessible scope."
        ],
        [
          "Status follow-up context",
          "Use transport status and trends to prioritize the day's review."
        ],
        [
          "Connected workspace entries",
          "Open customer and shipment pages to review the complete context."
        ]
      ],
      scenarios: [
        [
          "Starting the working day",
          "Find records that need information checks or a transport refresh."
        ],
        [
          "Reviewing business activity",
          "Follow related objects and continue the work with the responsible team."
        ]
      ],
      faq: [
        [
          "Why do accounts see different overviews?",
          "The overview follows business permissions and accessible objects. Available modules and records depend on the signed-in account."
        ],
        [
          "Can every record be changed from the overview?",
          "The overview helps locate work. Maintenance takes place in the relevant workspace and requires its permissions."
        ]
      ]
    }
  },
  shipments: {
    zh: {
      overview: [
        "票单是运输信息与业务协作之间的连接点。将承运人、参考号、港口、航次、时间和备注放在同一业务记录中，便于持续维护和查找。",
        "在同一票单中核对查询结果、客户绑定与发布范围，让负责人员知道当前记录描述了什么，也让客户按授权查看适用的业务。"
      ],
      deliverables: [
        ["可维护的票单记录", "保存承运人、参考号和业务字段，为后续跟进建立上下文。"],
        ["运输信息核对", "对照查询与刷新结果，复核已保存的运输进度与时间。"],
        ["客户绑定与发布设置", "维护客户关联和发布范围，让共享遵循实际业务权限。"]
      ],
      scenarios: [
        ["新票单建档与维护", "先录入业务标识，再逐步完善运输字段和业务备注。"],
        ["向客户共享进度", "复核客户关系与发布状态后，让客户在自己的范围内查看业务。"]
      ],
      faq: [
        [
          "查询结果和票单资料有什么关系？",
          "票单保留业务记录，查询提供运输信息。请结合刷新结果和实际业务确认字段，不能把未返回的内容视为已确认。"
        ],
        [
          "建立票单后客户立即可见吗？",
          "客户可见性还取决于绑定关系、发布状态和账号授权。维护后请核对实际共享范围。"
        ]
      ]
    },
    en: {
      overview: [
        "A shipment record connects transport information with business collaboration. Maintain carrier, references, ports, voyage, times and notes together so the work stays easy to locate and review.",
        "Review query results, customer bindings and publication scope in the shipment context. Responsible users can maintain the record while customers see the business authorized for them."
      ],
      deliverables: [
        [
          "A maintainable shipment record",
          "Keep carrier, reference and business fields in context for follow-up."
        ],
        [
          "Transport information review",
          "Compare query and refresh outcomes with saved progress and times."
        ],
        [
          "Customer and publication settings",
          "Maintain bindings and sharing scope according to business permissions."
        ]
      ],
      scenarios: [
        [
          "Creating and maintaining shipments",
          "Establish the reference first, then complete transport details and notes."
        ],
        [
          "Sharing progress with customers",
          "Review customer relationships and publication before making business visible."
        ]
      ],
      faq: [
        [
          "How do query results relate to saved records?",
          "The record holds business information; queries supply transport information. Review returned data against the actual business before confirming fields."
        ],
        [
          "Does a new shipment become visible to customers immediately?",
          "Visibility depends on customer binding, publication status and account authorization. Check the actual sharing scope after maintenance."
        ]
      ]
    }
  },
  customers: {
    zh: {
      overview: [
        "客户目录为客户身份、联系人与关联业务建立共同索引。通过创建或导入整理客户资料，再在详情中核对代码、账号与日常联系信息。",
        "资料维护与业务共享相互衔接。将票单绑定到正确客户，并确认授权与发布范围，有助于减少同名、错绑或重复确认带来的沟通成本。"
      ],
      deliverables: [
        ["统一客户资料", "集中维护客户身份、联系人与账号信息，便于检索和核对。"],
        ["客户身份依据", "核对客户代码与业务身份，帮助正确关联后续记录。"],
        ["关联票单视图", "在授权范围内连接客户与票单，为客户服务保留业务背景。"]
      ],
      scenarios: [
        ["客户资料初次整理", "通过创建或导入建立资料，并核对客户代码与联系人。"],
        ["持续服务与沟通", "从客户详情找到对应业务，再跟进客户关注的运输与文件事项。"]
      ],
      faq: [
        [
          "导入后还需要核对资料吗？",
          "需要。请核对客户代码、联系信息和账号归属，及时处理导入结果中提示的问题。"
        ],
        [
          "维护客户资料会自动开放全部票单吗？",
          "不会。票单共享仍取决于实际绑定关系、发布范围和账号权限。"
        ]
      ]
    },
    en: {
      overview: [
        "The customer directory connects identity, contacts and related work. Create or import records, then review customer codes, accounts and everyday contact information in detail.",
        "Record maintenance supports accurate business sharing. Bind the correct customer to a shipment and confirm authorization and publication scope to reduce mistaken relationships and repeated clarification."
      ],
      deliverables: [
        [
          "Unified customer information",
          "Maintain identity, contacts and account details for retrieval and review."
        ],
        [
          "Customer identity context",
          "Check codes and business identity before linking other records."
        ],
        [
          "Related shipment context",
          "Connect customers with authorized shipments for ongoing service."
        ]
      ],
      scenarios: [
        [
          "Organizing customer information",
          "Create or import records and check customer codes and contacts."
        ],
        [
          "Ongoing customer service",
          "Find related business and follow up on transport and document questions."
        ]
      ],
      faq: [
        [
          "Should imported records be reviewed?",
          "Yes. Check customer codes, contacts and account ownership, and address any issues reported in the import result."
        ],
        [
          "Does customer maintenance share every shipment?",
          "No. Sharing still depends on shipment bindings, publication and account permissions."
        ]
      ]
    }
  },
  agents: {
    zh: {
      overview: [
        "代理协作从清楚的账号与业务关系开始。通过创建或导入维护代理资料，再按实际业务归属连接客户与票单，让后续跟进有可识别的责任范围。",
        "代理看到什么、可以处理什么，沿用已配置的账号权限和业务关系。维护关联时，先确认对象与归属，再在授权范围内开展协作。"
      ],
      deliverables: [
        ["代理账号资料", "建立并维护代理身份与账号信息，支持日常查找和管理。"],
        ["业务对象关联", "维护与代理相关的客户及票单关系，明确业务背景。"],
        ["按范围协作的入口", "通过可访问的业务记录继续跟进，保持对象与责任关系清楚。"]
      ],
      scenarios: [
        ["合作代理资料建立", "在首次协作前整理账号信息，并核对对应业务关系。"],
        ["跨角色业务跟进", "让代理围绕已授权客户和票单处理后续事项。"]
      ],
      faq: [
        [
          "建立代理账号等于开放全部业务吗？",
          "不是。可访问范围由账号权限与业务关系共同决定，需按实际配置核对。"
        ],
        [
          "业务归属调整后如何继续处理？",
          "请复核代理与业务对象的关联；涉及交接的事项可继续查看交接流程与记录。"
        ]
      ]
    },
    en: {
      overview: [
        "Agent collaboration starts with clear accounts and business relationships. Create or import agent records, then connect customers and shipments according to business ownership.",
        "Visibility and available actions follow configured permissions and relationships. Confirm the object and its ownership before continuing collaboration within the authorized scope."
      ],
      deliverables: [
        [
          "Agent account information",
          "Create and maintain identifiable agent records for daily use."
        ],
        [
          "Business relationships",
          "Maintain related customer and shipment links with clear context."
        ],
        ["Scoped collaboration entries", "Continue follow-up through accessible business records."]
      ],
      scenarios: [
        [
          "Starting an agent relationship",
          "Prepare account details and review associated business before collaboration."
        ],
        [
          "Following work across roles",
          "Let agents continue with customers and shipments authorized for them."
        ]
      ],
      faq: [
        [
          "Does an agent account open all business?",
          "No. Access follows both account permissions and business relationships. Review the configured scope."
        ],
        [
          "What happens when business ownership changes?",
          "Review the agent-to-business relationship and consult the handover workflow and records when applicable."
        ]
      ]
    }
  },
  handover: {
    zh: {
      overview: [
        "业务交接将对象、接收账号与原因放在同一次操作中确认，帮助团队清楚地表达哪些工作需要由谁继续处理。提交前核对范围，提交后查看结果与记录。",
        "交接记录为后续跟进保留依据，避免只依靠即时消息还原业务变化。接收人员仍应结合实际对象和账号权限复核当前业务。"
      ],
      deliverables: [
        ["明确的交接范围", "选择需要交接的对象，提交前核对本次变更包含的业务。"],
        ["接收方与原因记录", "确认接收账号，填写交接原因，保留可理解的变更背景。"],
        ["后续可查的交接结果", "查看提交结果与交接记录，为接手和复核提供依据。"]
      ],
      scenarios: [
        ["人员与负责关系调整", "将具体业务交给适用账号，核对范围后完成变更。"],
        ["阶段性工作接手", "接收方根据交接记录识别对象，再继续查看客户和票单详情。"]
      ],
      faq: [
        [
          "是否可以交接不在自己范围内的业务？",
          "可用对象和操作受账号权限控制。请以页面提供的实际可选范围为准。"
        ],
        [
          "交接记录是否代表业务已经完成？",
          "交接记录表达负责关系的变更依据。业务进度仍需进入对应客户或票单继续核对。"
        ]
      ]
    },
    en: {
      overview: [
        "Business handover brings the objects, recipient and reason into one reviewed action. Confirm what will change before submitting, then review the outcome and its record.",
        "Handover history gives follow-up a traceable basis beyond chat messages. Recipients should still inspect the current business objects and their account permissions."
      ],
      deliverables: [
        [
          "An explicit handover scope",
          "Choose the business objects and review the scope of the change."
        ],
        [
          "Recipient and reason",
          "Identify the receiving account and preserve understandable context."
        ],
        ["A reviewable outcome", "Check the result and history when taking over the work."]
      ],
      scenarios: [
        [
          "Changes in responsibility",
          "Transfer applicable business to the receiving account after reviewing scope."
        ],
        [
          "Taking over ongoing work",
          "Use the handover record to identify objects and open their details."
        ]
      ],
      faq: [
        [
          "Can I hand over business outside my scope?",
          "Available objects and actions are controlled by permissions. Use the scope offered by the actual page."
        ],
        [
          "Does a handover record mean the business is complete?",
          "It records a responsibility change. Review progress separately in the relevant customer or shipment."
        ]
      ]
    }
  },
  files: {
    zh: {
      overview: [
        "文件协作围绕具体票单展开。进入获授权的业务上下文，查看关联文件，对支持的格式进行预览，或下载资料后继续核对，让文件与业务对象保持关联。",
        "留言与资料查看服务于票单沟通。共享前确认文件内容和访问范围，避免脱离业务背景单独理解附件。"
      ],
      deliverables: [
        ["票单关联资料", "从对应业务定位文件，保留文件所属的票单上下文。"],
        ["预览与下载入口", "预览页面支持的格式，或下载文件到本地进一步查看。"],
        ["围绕资料的留言", "结合实际文件与票单发送留言，方便后续业务沟通。"]
      ],
      scenarios: [
        ["运输资料核对", "在查看票单时打开关联附件，核对业务中需要确认的内容。"],
        ["客户与团队资料沟通", "在获授权的范围内查看文件，并就具体资料补充说明。"]
      ],
      faq: [
        [
          "输入公开追踪单号就能下载文件吗？",
          "不能。文件访问需要账号及对应票单权限，公开运输查询本身不会授予文件权限。"
        ],
        [
          "为什么有些文件无法直接预览？",
          "预览取决于文件格式与页面支持情况。获授权时可下载后使用适用的软件查看。"
        ]
      ]
    },
    en: {
      overview: [
        "Document collaboration belongs to a specific shipment. Open an authorized business context, review related files, preview supported formats or download them for further checks.",
        "Comments and document viewing support shipment conversations. Confirm content and access scope before sharing, and keep attachments connected to their business context."
      ],
      deliverables: [
        ["Shipment-related material", "Locate files through the business record they belong to."],
        [
          "Preview and download entries",
          "Preview supported formats or download for further review."
        ],
        [
          "Document-related comments",
          "Add context to a shipment conversation with relevant comments."
        ]
      ],
      scenarios: [
        [
          "Checking transport material",
          "Open attachments while reviewing a shipment and verify the details that matter."
        ],
        [
          "Discussing documents",
          "Review files within the authorized scope and clarify specific information."
        ]
      ],
      faq: [
        [
          "Does a public tracking number grant file downloads?",
          "No. File access requires an account and shipment permissions. A public transport query does not grant document access."
        ],
        [
          "Why can some files not be previewed?",
          "Preview depends on format and page support. Authorized users can download and view files with suitable software."
        ]
      ]
    }
  },
  customerportal: {
    zh: {
      overview: [
        "客户工作区为客户提供与自己业务相关的查看入口。使用客户账号、密码与客户代码登录后，在专属范围内查看已绑定、已授权并已发布的票单。",
        "客户无需进入内部业务维护流程，即可从自己的票单开始查看运输信息。遇到缺少业务或身份信息不匹配时，可通过原有业务联系渠道核实。"
      ],
      deliverables: [
        ["专属客户访问入口", "使用企业提供的客户登录信息进入对应工作区。"],
        ["已发布业务清单", "集中查看当前账号有权限访问的绑定票单。"],
        ["运输进度查看路径", "从客户范围内的业务继续核对运输状态与关联信息。"]
      ],
      scenarios: [
        ["客户自助查看进度", "从自己的票单列表开始了解业务状态，再就具体事项联系业务人员。"],
        ["固定客户持续跟进", "通过统一入口查看已发布业务，减少反复确认单号与身份。"]
      ],
      faq: [
        [
          "客户代码从哪里获得？",
          "客户账号及代码由企业管理员或业务方提供与维护，请通过已有业务联系渠道核实。"
        ],
        [
          "为什么看不到某票业务？",
          "请确认登录身份、票单客户绑定、授权与发布状态。工作区只展示适用于当前账号的业务。"
        ]
      ]
    },
    en: {
      overview: [
        "The customer portal offers a view of business relevant to the customer. Sign in with the customer account, password and code to see linked, authorized and published shipments.",
        "Customers can begin with their own shipment list and inspect transport information. If business is missing or identity information does not match, confirm through the existing business contact."
      ],
      deliverables: [
        [
          "A dedicated customer entry",
          "Sign in with the customer credentials supplied by the company."
        ],
        ["Published business list", "Review linked shipments that the current account may access."],
        [
          "A path to transport progress",
          "Continue from customer-scoped records to transport and related information."
        ]
      ],
      scenarios: [
        [
          "Customer progress checks",
          "Start with the shipment list, then discuss specific questions with the business team."
        ],
        [
          "Ongoing customer follow-up",
          "Use one entry for published work and reduce repeated reference checks."
        ]
      ],
      faq: [
        [
          "Where do I get a customer code?",
          "The company administrator or business team supplies and maintains customer credentials. Confirm through your existing business contact."
        ],
        [
          "Why is a shipment missing?",
          "Check the signed-in identity, customer binding, authorization and publication. Only business applicable to the account appears."
        ]
      ]
    }
  },
  administration: {
    zh: {
      overview: [
        "管理控制台连接账号、业务负责关系与系统维护。管理员在相应模块中查看员工、客户、票单、交接和审计信息，结合业务背景处理管理事项。",
        "涉及账号、文件、公告或设备会话的操作，应先识别目标与影响范围，再提交并核对结果。管理入口遵循管理员身份与各模块的实际能力。"
      ],
      deliverables: [
        ["账号与负责关系维护", "集中处理员工、客户及业务归属等适用管理事项。"],
        ["业务与审计查看", "查阅全局票单、交接与操作记录，为问题定位提供背景。"],
        ["日常系统管理入口", "进入文件、公告、设备会话和可用配置模块处理维护工作。"]
      ],
      scenarios: [
        ["账号与组织关系调整", "在明确目标账号与业务归属后，完成相应维护并复核结果。"],
        ["业务问题追溯", "结合票单、交接与操作记录，核查变化的对象和处理过程。"]
      ],
      faq: [
        [
          "普通员工可以进入管理控制台吗？",
          "管理入口要求管理员身份。普通业务账号请使用获授权的业务工作台。"
        ],
        [
          "如何确认管理操作的影响？",
          "提交前阅读页面提示并核对目标；提交后检查结果，需要时结合操作记录复核。"
        ]
      ]
    },
    en: {
      overview: [
        "Administration connects accounts, business ownership and system maintenance. Administrators review employee, customer, shipment, handover and audit information in the appropriate modules.",
        "Identify the target and impact before changing accounts, files, announcements or device sessions. Submit the action and review its outcome using the capabilities available to the administrator."
      ],
      deliverables: [
        [
          "Accounts and responsibility",
          "Maintain applicable employee, customer and ownership relationships."
        ],
        [
          "Business and audit context",
          "Review global shipments, handovers and operation history when investigating issues."
        ],
        [
          "System maintenance entries",
          "Open file, announcement, device-session and available configuration modules."
        ]
      ],
      scenarios: [
        [
          "Account and ownership changes",
          "Confirm the target and relationships, perform maintenance and review the outcome."
        ],
        [
          "Investigating business changes",
          "Use shipments, handovers and operation history to understand the change."
        ]
      ],
      faq: [
        [
          "Can ordinary employees open administration?",
          "An administrator identity is required. Business users should use their authorized workspaces."
        ],
        [
          "How do I confirm an action's impact?",
          "Read page guidance and check the target before submission. Review the result and operation history when needed."
        ]
      ]
    }
  }
};

export const publicDetailLabels = {
  zh: {
    overview: "服务概览",
    outcomes: "你将获得什么",
    outcomesBody: "从输入到输出，让每一步工作都有清楚的落点。",
    scenarios: "适用场景",
    faq: "常见问题",
    next: "让下一步，清楚地开始。",
    nextBody: "了解所需资料与访问范围后，进入服务继续处理你的业务。",
    more: "更多详细信息",
    company: "关于我们",
    indexTitle: "一个平台，串起货物的每一步。",
    indexBody:
      "从运输查询与装载准备，到客户资料、票单与交接协作。按你的工作场景了解工具，找到需要准备的资料、可以获得的结果与正确入口。",
    approach: "从业务出发，连接工具与协作",
    approachBody:
      "公开查询帮助了解运输信息；企业工作区组织业务记录；客户入口让已发布业务在适用范围内可见。每项能力都服务于一个明确的工作环节。",
    pathways: ["掌握运输信息", "准备装载方案", "组织业务协作"],
    pathwayBodies: [
      "选择承运人与单号，区分预计安排与实际事件。",
      "整理尺寸、重量与约束，查看三维方案并导出资料。",
      "围绕客户与票单维护关系、文件和交接记录。"
    ],
    companyTitle: "连接每一程，专注每一步。",
    companyBody:
      "上海罗加国际货物运输代理有限公司以 logisticspluscn 为品牌，围绕货物运输中的信息查询、装载准备和业务协作，提供清晰、连贯的数字化服务入口。",
    companySecond:
      "我们关注日常工作中具体的信息衔接：一张单号如何被正确查询，一份装载方案如何被团队理解，一票业务如何在客户与负责人员之间有序跟进。",
    companyValues: [
      ["信息有依据", "区分预计与实际，保留来源与更新信息，让业务判断建立在可复核的资料上。"],
      ["协作有上下文", "客户、票单、文件与交接相互关联，让沟通围绕具体业务展开。"],
      ["访问有边界", "根据账号身份、业务关系与发布范围提供适用入口，让不同角色各有清楚的工作范围。"]
    ],
    companyScope: "围绕运输，做好信息与协作",
    companyScopeBody:
      "平台将运输追踪、箱型资料、三维装箱规划与业务管理连接在一起。你可以先了解各项能力，再进入公开工具或使用已分配的账号继续工作。",
    companyContact: "继续了解与使用",
    companyContactBody:
      "已有业务请通过原有业务联系渠道沟通。客户账号、客户代码与使用权限由企业管理员或业务方维护。",
    companyAction: "了解全部平台能力"
  },
  en: {
    overview: "Service overview",
    outcomes: "What you can take forward",
    outcomesBody: "Clear outputs connect preparation with the next action.",
    scenarios: "Where it fits",
    faq: "Frequently asked questions",
    next: "A clearer next step starts here.",
    nextBody: "Review the information and account scope you need, then continue with your work.",
    more: "More information",
    company: "About us",
    indexTitle: "One platform. Connected shipment work.",
    indexBody:
      "From transport visibility and load preparation to customers, shipments and handovers. Explore each workflow, understand the information it needs and find the right entry.",
    approach: "Connect tools around the work",
    approachBody:
      "Public queries provide transport information. Business workspaces organize records. Customer access makes published work visible within its authorized scope. Each capability supports a defined part of the workflow.",
    pathways: ["Understand transport", "Prepare the load", "Organize collaboration"],
    pathwayBodies: [
      "Select a carrier and reference; separate estimates from actual events.",
      "Prepare dimensions, weights and limits; review 3D plans and export material.",
      "Maintain customers, shipments, documents and handover records in context."
    ],
    companyTitle: "Connected journeys. Considered steps.",
    companyBody:
      "Shanghai Luojia International Freight Forwarding Co., Ltd. operates under the logisticspluscn brand, connecting transport information, load preparation and business collaboration through clear digital service entries.",
    companySecond:
      "We focus on the practical connections in daily shipment work: querying the right reference, helping a team understand a loading plan, and keeping business follow-up organized between customers and responsible users.",
    companyValues: [
      [
        "Information with a basis",
        "Distinguish estimates from actuals and preserve source and update context for reviewable decisions."
      ],
      [
        "Collaboration in context",
        "Connect customers, shipments, documents and handovers around the actual business."
      ],
      [
        "Clear access boundaries",
        "Offer appropriate entries according to account identity, business relationships and publication scope."
      ]
    ],
    companyScope: "Information and collaboration around transport",
    companyScopeBody:
      "The platform connects tracking, equipment reference, 3D load planning and business management. Explore the capabilities, use a public tool or continue with an assigned account.",
    companyContact: "Explore and continue",
    companyContactBody:
      "For existing business, use your established contact channel. The company administrator or business team maintains customer accounts, codes and permissions.",
    companyAction: "Explore platform capabilities"
  }
};

export function getPublicDetailLabels(locale) {
  return publicDetailLabels[locale === "en-US" ? "en" : "zh"];
}
export function getPublicDetailContent(id, locale) {
  return details[id]?.[locale === "en-US" ? "en" : "zh"];
}
