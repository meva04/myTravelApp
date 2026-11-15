// 편명 앞 두 글자(IATA 항공사 코드) → 항공사 이름. 앱 안의 표라 요금이 없다.
const AIRLINES: Record<string, string> = {
  KE: '대한항공', OZ: '아시아나항공', '7C': '제주항공', LJ: '진에어', TW: '티웨이항공', BX: '에어부산', RS: '에어서울',
  ZE: '이스타항공', YP: '에어프레미아', RF: '에어로케이', '4V': '플라이강원', '4H': '하이에어',
  JL: '일본항공', NH: '전일본공수(ANA)', MM: '피치항공', GK: '젯스타 재팬', BC: '스카이마크',
  CA: '중국국제항공', MU: '중국동방항공', CZ: '중국남방항공', HU: '하이난항공', CX: '캐세이퍼시픽', HX: '홍콩항공', UO: '홍콩익스프레스',
  BR: '에바항공', CI: '중화항공', IT: '타이거에어 타이완', SQ: '싱가포르항공', TR: '스쿠트', TG: '타이항공', VN: '베트남항공', VJ: '비엣젯항공',
  PR: '필리핀항공', '5J': '세부퍼시픽', MH: '말레이시아항공', AK: '에어아시아', D7: '에어아시아X', GA: '가루다인도네시아',
  QF: '콴타스', JQ: '젯스타', NZ: '에어뉴질랜드', DL: '델타항공', UA: '유나이티드항공', AA: '아메리칸항공', AC: '에어캐나다', HA: '하와이안항공', AS: '알래스카항공',
  BA: '영국항공', VS: '버진애틀랜틱', AF: '에어프랑스', KL: 'KLM', LH: '루프트한자', LX: '스위스항공', OS: '오스트리아항공', AY: '핀에어', SK: 'SAS',
  IB: '이베리아항공', VY: '부엘링', AZ: 'ITA항공', TK: '터키항공', LO: 'LOT 폴란드항공', FR: '라이언에어', U2: '이지젯', W6: '위즈에어',
  EK: '에미레이트항공', QR: '카타르항공', EY: '에티하드항공', SV: '사우디아항공', ET: '에티오피아항공', AI: '에어인디아', SU: '아에로플로트',
};

/** 'KE703' → { code: 'KE', name: '대한항공' } */
export function airlineOf(flightNo: string): { code: string; name: string } | null {
  const m = flightNo.replace(/\s+/g, '').toUpperCase().match(/^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/);
  if (!m || !/[A-Z]/.test(m[1])) return null;
  const name = AIRLINES[m[1]];
  return name ? { code: m[1], name } : null;
}
