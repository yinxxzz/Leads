// Mock data for BPO, TMK, and CC allocation records
// TODO: Replace with real SQL queries in production

export interface BpoRecord {
  dt: string;
  userid: string;
  userType: string;
  rank: number;
  phone?: string;
  leadType?: string;
  grade?: string;
  extraInfo?: string;
  has_actual_assignment?: boolean | string | number;
  sales_ldap?: string;
  assigned_at?: string;
  has_called?: boolean | string | number;
  has_connected?: boolean | string | number;
  call_count?: number | string;
  latest_touch_at?: string;
}

export interface TmkRecord {
  dt: string;
  user_id: string;
  lead_channel: string;
  queue_rnk: string;
  hunt_lead_type?: string;
  grade?: string;
  has_actual_assignment?: boolean | string | number;
  sales_ldap?: string;
  assigned_at?: string;
  has_called?: boolean | string | number;
  has_connected?: boolean | string | number;
  call_count?: number | string;
  latest_touch_at?: string;
}

export interface CcRecord {
  dt: string;
  user_id: string;
  final_rank: string;
  business_line_type: string;
  leadtype?: string;
  grade?: string;
  predict_rank?: string;
  has_actual_assignment?: boolean | string | number;
  sales_ldap?: string;
  assigned_at?: string;
  has_called?: boolean | string | number;
  has_connected?: boolean | string | number;
  call_count?: number | string;
  latest_touch_at?: string;
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
    user_id: "464677672",
    leadtype: "20",
    grade: "A",
    final_rank: "1234",
    predict_rank: "5.4",
    business_line_type: "APP活跃",
  },
  {
    dt: "2026-05-18",
    user_id: "464677672",
    leadtype: "20",
    grade: "B",
    final_rank: "3456",
    predict_rank: "4.2",
    business_line_type: "补课复习",
  },
];
