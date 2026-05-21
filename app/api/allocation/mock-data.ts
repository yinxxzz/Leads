// Mock data for BPO, TMK, and CC allocation records
// TODO: Replace with real SQL queries in production

export interface BpoRecord {
  dt: string;
  userid: string;
  phone: string;
  leadType: string;
  userType: string;
  grade: string;
  rank: number;
  extraInfo: string;
}

export interface TmkRecord {
  dt: string;
  user_id: string;
  lead_channel: string;
  hunt_lead_type: string;
  grade: string;
  queue_rnk: string;
}

export interface CcRecord {
  dt: string;
  userid: string;
  user_type: string;
  business_line_type: string;
  business_line_tag: string;
  break_day_diff: string;
  predict_rank: string;
}

export const mockBpoRecords: BpoRecord[] = [
  {
    dt: "2026-05-18",
    userid: "123456789",
    phone: "138****5678",
    leadType: "externalLead",
    userType: "pediaStock",
    grade: "unset",
    rank: 28,
    extraInfo: "unset",
  },
  {
    dt: "2026-05-17",
    userid: "123456789",
    phone: "138****5678",
    leadType: "externalLead",
    userType: "百科存量",
    grade: "unset",
    rank: 42,
    extraInfo: "unset",
  },
  {
    dt: "2026-05-18",
    userid: "987654321",
    phone: "139****1111",
    leadType: "externalLead",
    userType: "pediaStock",
    grade: "unset",
    rank: 73,
    extraInfo: "unset",
  },
  {
    dt: "2026-05-16",
    userid: "111222333",
    phone: "137****9999",
    leadType: "externalLead",
    userType: "pediaStock",
    grade: "unset",
    rank: 15,
    extraInfo: "unset",
  },
];

export const mockTmkRecords: TmkRecord[] = [
  {
    dt: "2026-05-18",
    user_id: "123456789",
    lead_channel: "tmk_hunt",
    hunt_lead_type: "stock_user",
    grade: "S2",
    queue_rnk: "15",
  },
  {
    dt: "2026-05-16",
    user_id: "123456789",
    lead_channel: "tmk_hunt",
    hunt_lead_type: "external_lead",
    grade: "S1",
    queue_rnk: "31",
  },
  {
    dt: "2026-05-18",
    user_id: "987654321",
    lead_channel: "tmk_hunt",
    hunt_lead_type: "stock_user",
    grade: "S3",
    queue_rnk: "64",
  },
  {
    dt: "2026-05-17",
    user_id: "111222333",
    lead_channel: "tmk_hunt",
    hunt_lead_type: "external_lead",
    grade: "S1",
    queue_rnk: "8",
  },
];

export const mockCcRecords: CcRecord[] = [
  {
    dt: "2026-05-20",
    userid: "464677672",
    user_type: "体验课全断课",
    business_line_type: "APP活跃",
    business_line_tag: "10",
    break_day_diff: "25",
    predict_rank: "5.4",
  },
  {
    dt: "2026-01-22",
    userid: "464677672",
    user_type: "体验课全断课",
    business_line_type: "客服咨询&优惠券_下单未支付_观看直播(7岁以上)",
    business_line_tag: "1",
    break_day_diff: "null",
    predict_rank: "5.5",
  },
];
