export interface CourtOffice {
  code: string;
  name: string;
}

export interface ScheduleEntry {
  caseNo: string;
  itemNo: string;
  courtCode: string;
  courtName: string;
  deptName: string;
  bidDate: string;
  bidTime: string;
  minPrice: number;
  round: number;
  propertyType?: string;
  address?: string;
  usage?: string;
  appraisedPrice?: number;
}

export interface CourtDeptGroup {
  courtCode: string;
  courtName: string;
  deptName: string;
  bidTime: string;
  count: number;
  entries: ScheduleEntry[];
}

export interface DayScheduleGroup {
  date: string;
  weekday: string;
  totalCount: number;
  byCourt: CourtDeptGroup[];
}

export interface WeekSchedule {
  weekStart: string;
  weekEnd: string;
  courtCode: string;
  fetchedAt: number;
  days: DayScheduleGroup[];
}
