export type SearchResult = {
  id: string;
  title: string;
  code: string;
  region: string;
  publishAt: string;
  sectionPath: string;
  snippet: string;
  pageNo: number;
};

export const mockSearchResults: SearchResult[] = [
  {
    id: "doc-001",
    title: "建设工程工程量清单计价规范",
    code: "GB 50500-2013",
    region: "全国",
    publishAt: "2013-12-19",
    sectionPath: "4.1.2",
    snippet: "分部分项工程量清单应根据施工图纸、计量规范和招标文件进行编制。",
    pageNo: 27
  },
  {
    id: "doc-002",
    title: "房屋建筑与装饰工程工程量计算规范",
    code: "GB 50854-2013",
    region: "全国",
    publishAt: "2013-12-19",
    sectionPath: "2.0.4",
    snippet: "工程量计算应遵循设计文件、施工工艺与规范规则，计量单位应统一。",
    pageNo: 8
  },
  {
    id: "doc-003",
    title: "广东省建设工程计价依据（2022）",
    code: "粤建标〔2022〕",
    region: "广东",
    publishAt: "2022-06-01",
    sectionPath: "3.3.1",
    snippet: "措施项目费应结合施工组织设计、项目特征与市场因素综合确定。",
    pageNo: 42
  }
];

export const mockQASuggestions = [
  "清单计价中措施项目费如何确定？",
  "暂列金额与暂估价有什么区别？",
  "签证变更在结算时如何计价？"
];

export const mockAdminLeads = [
  {
    id: "lead-001",
    company: "华南造价咨询有限公司",
    contact: "张工",
    mobile: "138****1234",
    status: "新提交",
    createdAt: "2026-03-14 10:20"
  },
  {
    id: "lead-002",
    company: "中建某分公司",
    contact: "李经理",
    mobile: "139****8800",
    status: "已跟进",
    createdAt: "2026-03-13 16:08"
  }
];

export const mockQaLogs = [
  {
    id: "qa-001",
    question: "混凝土模板工程量按什么规则计量？",
    citation: "GB 50854-2013 相关条文",
    latency: "1.2s",
    createdAt: "2026-03-15 09:51"
  },
  {
    id: "qa-002",
    question: "综合单价构成包括哪些费用？",
    citation: "GB 50500-2013 4.3节",
    latency: "1.0s",
    createdAt: "2026-03-15 11:22"
  }
];

export const mockStandards = [
  {
    id: "std-001",
    title: "建设工程工程量清单计价规范",
    code: "GB 50500-2013",
    region: "全国",
    status: "已上线"
  },
  {
    id: "std-002",
    title: "广东省建设工程计价依据（2022）",
    code: "粤建标〔2022〕",
    region: "广东",
    status: "已上线"
  }
];
