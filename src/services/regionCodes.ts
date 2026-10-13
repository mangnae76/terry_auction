// 시도 · 시군구 표 — 국토부 실거래가 쓰는 LAWD_CD 5자리를 같이 들고 있다.
//
// 시장정보와 관리자 도구가 같은 표를 봐야 한다. 두 벌로 두면 한쪽만 고쳐져
// 같은 지역이 화면마다 달라진다.

export interface DistrictOption {
  label: string;
  lawdCode: string;
}

export interface RegionGroup {
  sido: string;
  districts: DistrictOption[];
}

export const REGION_GROUPS: RegionGroup[] = [
  {
    sido: '서울특별시',
    districts: [
      { label: '종로구', lawdCode: '11110' }, { label: '중구', lawdCode: '11140' },
      { label: '용산구', lawdCode: '11170' }, { label: '성동구', lawdCode: '11200' },
      { label: '광진구', lawdCode: '11215' }, { label: '동대문구', lawdCode: '11230' },
      { label: '중랑구', lawdCode: '11260' }, { label: '성북구', lawdCode: '11290' },
      { label: '강북구', lawdCode: '11305' }, { label: '도봉구', lawdCode: '11320' },
      { label: '노원구', lawdCode: '11350' }, { label: '은평구', lawdCode: '11380' },
      { label: '서대문구', lawdCode: '11410' }, { label: '마포구', lawdCode: '11440' },
      { label: '양천구', lawdCode: '11470' }, { label: '강서구', lawdCode: '11500' },
      { label: '구로구', lawdCode: '11530' }, { label: '금천구', lawdCode: '11545' },
      { label: '영등포구', lawdCode: '11560' }, { label: '동작구', lawdCode: '11590' },
      { label: '관악구', lawdCode: '11620' }, { label: '서초구', lawdCode: '11650' },
      { label: '강남구', lawdCode: '11680' }, { label: '송파구', lawdCode: '11710' },
      { label: '강동구', lawdCode: '11740' },
    ],
  },
  {
    sido: '부산광역시',
    districts: [
      { label: '중구', lawdCode: '26110' }, { label: '서구', lawdCode: '26140' },
      { label: '동구', lawdCode: '26170' }, { label: '영도구', lawdCode: '26200' },
      { label: '부산진구', lawdCode: '26230' }, { label: '동래구', lawdCode: '26260' },
      { label: '남구', lawdCode: '26290' }, { label: '북구', lawdCode: '26320' },
      { label: '해운대구', lawdCode: '26350' }, { label: '사하구', lawdCode: '26380' },
      { label: '금정구', lawdCode: '26410' }, { label: '강서구', lawdCode: '26440' },
      { label: '연제구', lawdCode: '26470' }, { label: '수영구', lawdCode: '26500' },
      { label: '사상구', lawdCode: '26530' }, { label: '기장군', lawdCode: '26710' },
    ],
  },
  {
    sido: '대구광역시',
    districts: [
      { label: '중구', lawdCode: '27110' }, { label: '동구', lawdCode: '27140' },
      { label: '서구', lawdCode: '27170' }, { label: '남구', lawdCode: '27200' },
      { label: '북구', lawdCode: '27230' }, { label: '수성구', lawdCode: '27260' },
      { label: '달서구', lawdCode: '27290' }, { label: '달성군', lawdCode: '27710' },
    ],
  },
  {
    sido: '인천광역시',
    districts: [
      { label: '중구', lawdCode: '28110' }, { label: '동구', lawdCode: '28140' },
      { label: '미추홀구', lawdCode: '28177' }, { label: '연수구', lawdCode: '28185' },
      { label: '남동구', lawdCode: '28200' }, { label: '부평구', lawdCode: '28237' },
      { label: '계양구', lawdCode: '28245' },
      // 2026년 인천 서구가 서해구·검단구로 나뉘었다. 옛 서구 코드(28260)로는
      // 실거래가 한 건도 오지 않는다 — 새 코드로 바꾸고 검단구를 더했다.
      { label: '서해구', lawdCode: '28275' }, { label: '검단구', lawdCode: '28290' },
      { label: '강화군', lawdCode: '28710' }, { label: '옹진군', lawdCode: '28720' },
    ],
  },
  {
    sido: '광주광역시',
    districts: [
      { label: '동구', lawdCode: '29110' }, { label: '서구', lawdCode: '29140' },
      { label: '남구', lawdCode: '29155' }, { label: '북구', lawdCode: '29170' },
      { label: '광산구', lawdCode: '29200' },
    ],
  },
  {
    sido: '대전광역시',
    districts: [
      { label: '동구', lawdCode: '30110' }, { label: '중구', lawdCode: '30140' },
      { label: '서구', lawdCode: '30170' }, { label: '유성구', lawdCode: '30200' },
      { label: '대덕구', lawdCode: '30230' },
    ],
  },
  {
    sido: '울산광역시',
    districts: [
      { label: '중구', lawdCode: '31110' }, { label: '남구', lawdCode: '31140' },
      { label: '동구', lawdCode: '31170' }, { label: '북구', lawdCode: '31200' },
      { label: '울주군', lawdCode: '31710' },
    ],
  },
  {
    sido: '세종특별자치시',
    districts: [{ label: '세종시', lawdCode: '36110' }],
  },
  {
    sido: '경기도',
    districts: [
      { label: '수원시', lawdCode: '41110' }, { label: '성남시', lawdCode: '41130' },
      { label: '의정부시', lawdCode: '41150' }, { label: '안양시', lawdCode: '41170' },
      { label: '부천시', lawdCode: '41190' }, { label: '광명시', lawdCode: '41210' },
      { label: '평택시', lawdCode: '41220' }, { label: '동두천시', lawdCode: '41250' },
      { label: '안산시', lawdCode: '41270' }, { label: '고양시', lawdCode: '41280' },
      { label: '과천시', lawdCode: '41290' }, { label: '구리시', lawdCode: '41310' },
      { label: '남양주시', lawdCode: '41360' }, { label: '오산시', lawdCode: '41370' },
      { label: '시흥시', lawdCode: '41390' }, { label: '군포시', lawdCode: '41410' },
      { label: '의왕시', lawdCode: '41430' }, { label: '하남시', lawdCode: '41450' },
      { label: '용인시', lawdCode: '41460' }, { label: '파주시', lawdCode: '41480' },
      { label: '이천시', lawdCode: '41500' }, { label: '안성시', lawdCode: '41550' },
      { label: '김포시', lawdCode: '41570' }, { label: '화성시', lawdCode: '41590' },
      { label: '광주시', lawdCode: '41610' }, { label: '양주시', lawdCode: '41630' },
      { label: '포천시', lawdCode: '41650' }, { label: '여주시', lawdCode: '41670' },
      { label: '연천군', lawdCode: '41800' }, { label: '가평군', lawdCode: '41820' },
      { label: '양평군', lawdCode: '41830' },
    ],
  },
  {
    sido: '강원특별자치도',
    districts: [
      { label: '춘천시', lawdCode: '42110' }, { label: '원주시', lawdCode: '42130' },
      { label: '강릉시', lawdCode: '42150' }, { label: '동해시', lawdCode: '42170' },
      { label: '태백시', lawdCode: '42190' }, { label: '속초시', lawdCode: '42210' },
      { label: '삼척시', lawdCode: '42230' },
    ],
  },
  {
    sido: '충청북도',
    districts: [
      { label: '청주시', lawdCode: '43110' }, { label: '충주시', lawdCode: '43130' },
      { label: '제천시', lawdCode: '43150' },
    ],
  },
  {
    sido: '충청남도',
    districts: [
      { label: '천안시', lawdCode: '44130' }, { label: '공주시', lawdCode: '44150' },
      { label: '보령시', lawdCode: '44180' }, { label: '아산시', lawdCode: '44200' },
      { label: '서산시', lawdCode: '44210' }, { label: '논산시', lawdCode: '44230' },
    ],
  },
  {
    sido: '전북특별자치도',
    districts: [
      { label: '전주시', lawdCode: '45110' }, { label: '군산시', lawdCode: '45130' },
      { label: '익산시', lawdCode: '45140' }, { label: '정읍시', lawdCode: '45180' },
    ],
  },
  {
    sido: '전라남도',
    districts: [
      { label: '목포시', lawdCode: '46110' }, { label: '여수시', lawdCode: '46130' },
      { label: '순천시', lawdCode: '46150' }, { label: '광양시', lawdCode: '46230' },
    ],
  },
  {
    sido: '경상북도',
    districts: [
      { label: '포항시', lawdCode: '47110' }, { label: '경주시', lawdCode: '47130' },
      { label: '김천시', lawdCode: '47150' }, { label: '안동시', lawdCode: '47170' },
      { label: '구미시', lawdCode: '47190' },
    ],
  },
  {
    sido: '경상남도',
    districts: [
      { label: '창원시', lawdCode: '48120' }, { label: '진주시', lawdCode: '48170' },
      { label: '통영시', lawdCode: '48220' }, { label: '사천시', lawdCode: '48240' },
      { label: '김해시', lawdCode: '48250' }, { label: '밀양시', lawdCode: '48270' },
      { label: '거제시', lawdCode: '48310' }, { label: '양산시', lawdCode: '48330' },
    ],
  },
  {
    sido: '제주특별자치도',
    districts: [
      { label: '제주시', lawdCode: '50110' }, { label: '서귀포시', lawdCode: '50130' },
    ],
  },
];

/** 그 시도의 시군구 목록 — 없으면 빈 배열 */
export const districtsOf = (sido: string): DistrictOption[] =>
  REGION_GROUPS.find((g) => g.sido === sido)?.districts ?? [];

/** 시도 이름만 (전국은 넣지 않는다 — 부르는 쪽에서 따로 다룬다) */
export const SIDO_NAMES: string[] = REGION_GROUPS.map((g) => g.sido);
