// 나라·도시 이름 → 그 곳 통화. 여행지를 적으면 현지 통화를 정하는 데 쓴다.
import type { Trip } from './types';

/** 통화별로 그 통화를 쓰는 나라와 대표 도시 (한글·영어). 긴 이름이 먼저 맞도록 찾을 때 길이순으로 본다. */
const PLACES: Record<string, string[]> = {
  KRW: ['한국', '대한민국', 'Korea', '서울', '부산', '제주', 'Seoul', 'Busan', 'Jeju'],
  JPY: ['일본', 'Japan', '도쿄', '오사카', '교토', '후쿠오카', '삿포로', '오키나와', '나고야', '고베', 'Tokyo', 'Osaka', 'Kyoto', 'Fukuoka', 'Sapporo', 'Okinawa', 'Nagoya'],
  CNY: ['중국', 'China', '베이징', '상하이', '칭다오', '광저우', '선전', '청두', '시안', 'Beijing', 'Shanghai', 'Qingdao'],
  HKD: ['홍콩', 'Hong Kong'],
  MOP: ['마카오', 'Macau', 'Macao'],
  TWD: ['대만', 'Taiwan', '타이베이', '타이중', '가오슝', 'Taipei', 'Kaohsiung'],
  THB: ['태국', 'Thailand', '방콕', '치앙마이', '푸켓', '파타야', 'Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya'],
  VND: ['베트남', 'Vietnam', 'Viet Nam', '하노이', '호치민', '다낭', '나트랑', '냐짱', '푸꾸옥', '호이안', 'Hanoi', 'Ho Chi Minh', 'Da Nang', 'Nha Trang', 'Phu Quoc'],
  PHP: ['필리핀', 'Philippines', '마닐라', '세부', '보라카이', '보홀', 'Manila', 'Cebu', 'Boracay'],
  SGD: ['싱가포르', 'Singapore'],
  MYR: ['말레이시아', 'Malaysia', '쿠알라룸푸르', '코타키나발루', '페낭', 'Kuala Lumpur', 'Kota Kinabalu', 'Penang'],
  IDR: ['인도네시아', 'Indonesia', '발리', '자카르타', 'Bali', 'Jakarta'],
  KHR: ['캄보디아', 'Cambodia', '씨엠립', '프놈펜', 'Siem Reap', 'Phnom Penh'],
  LAK: ['라오스', 'Laos', '비엔티안', '루앙프라방', 'Vientiane', 'Luang Prabang'],
  MNT: ['몽골', 'Mongolia', '울란바토르', 'Ulaanbaatar'],
  INR: ['인도', 'India', '뉴델리', '뭄바이', 'New Delhi', 'Mumbai'],
  NPR: ['네팔', 'Nepal', '카트만두', 'Kathmandu'],
  LKR: ['스리랑카', 'Sri Lanka'],
  MVR: ['몰디브', 'Maldives'],
  AED: ['아랍에미리트', 'UAE', '두바이', '아부다비', 'Dubai', 'Abu Dhabi'],
  QAR: ['카타르', 'Qatar', '도하', 'Doha'],
  TRY: ['튀르키예', '터키', 'Turkey', 'Türkiye', '이스탄불', '카파도키아', 'Istanbul', 'Cappadocia'],
  ILS: ['이스라엘', 'Israel', '예루살렘', 'Jerusalem'],
  EGP: ['이집트', 'Egypt', '카이로', 'Cairo'],
  MAD: ['모로코', 'Morocco', '마라케시', 'Marrakech'],
  ZAR: ['남아프리카', 'South Africa', '케이프타운', 'Cape Town'],
  USD: ['미국', 'USA', 'United States', '뉴욕', '로스앤젤레스', 'LA', '샌프란시스코', '라스베이거스', '하와이', '호놀룰루', '시애틀', '시카고', '보스턴', '워싱턴', '마이애미', '괌', '사이판', 'New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'Hawaii', 'Honolulu', 'Guam', 'Saipan', '에콰도르', 'Ecuador'],
  CAD: ['캐나다', 'Canada', '밴쿠버', '토론토', '몬트리올', '퀘벡', '밴프', 'Vancouver', 'Toronto', 'Montreal', 'Quebec', 'Banff'],
  MXN: ['멕시코', 'Mexico', '칸쿤', 'Cancun'],
  BRL: ['브라질', 'Brazil', '리우데자네이루', '상파울루', 'Rio de Janeiro', 'Sao Paulo'],
  ARS: ['아르헨티나', 'Argentina', '부에노스아이레스', 'Buenos Aires'],
  PEN: ['페루', 'Peru', '리마', '쿠스코', 'Lima', 'Cusco'],
  CLP: ['칠레', 'Chile', '산티아고', 'Santiago'],
  AUD: ['호주', '오스트레일리아', 'Australia', '시드니', '멜버른', '브리즈번', '골드코스트', '케언즈', '퍼스', 'Sydney', 'Melbourne', 'Brisbane', 'Gold Coast', 'Cairns', 'Perth'],
  NZD: ['뉴질랜드', 'New Zealand', '오클랜드', '퀸스타운', '크라이스트처치', 'Auckland', 'Queenstown', 'Christchurch'],
  GBP: ['영국', 'United Kingdom', 'UK', 'England', 'Scotland', '런던', '에든버러', '맨체스터', '리버풀', '옥스퍼드', 'London', 'Edinburgh', 'Manchester', 'Liverpool', 'Oxford'],
  CHF: ['스위스', 'Switzerland', '취리히', '제네바', '인터라켄', '루체른', '체르마트', 'Zurich', 'Geneva', 'Interlaken', 'Lucerne', 'Zermatt'],
  CZK: ['체코', 'Czech', '프라하', 'Prague'],
  HUF: ['헝가리', 'Hungary', '부다페스트', 'Budapest'],
  PLN: ['폴란드', 'Poland', '바르샤바', '크라쿠프', 'Warsaw', 'Krakow'],
  DKK: ['덴마크', 'Denmark', '코펜하겐', 'Copenhagen'],
  SEK: ['스웨덴', 'Sweden', '스톡홀름', 'Stockholm'],
  NOK: ['노르웨이', 'Norway', '오슬로', '베르겐', 'Oslo', 'Bergen'],
  ISK: ['아이슬란드', 'Iceland', '레이캬비크', 'Reykjavik'],
  RUB: ['러시아', 'Russia', '모스크바', '블라디보스토크', 'Moscow', 'Vladivostok'],
  GEL: ['조지아', 'Georgia', '트빌리시', 'Tbilisi'],
  KZT: ['카자흐스탄', 'Kazakhstan', '알마티', 'Almaty'],
  UZS: ['우즈베키스탄', 'Uzbekistan', '타슈켄트', '사마르칸트', 'Tashkent', 'Samarkand'],
  EUR: [
    '프랑스', 'France', '파리', '니스', '리옹', 'Paris', 'Nice', 'Lyon',
    '이탈리아', 'Italy', '로마', '밀라노', '피렌체', '베네치아', '나폴리', 'Rome', 'Milan', 'Florence', 'Venice', 'Naples',
    '스페인', 'Spain', '바르셀로나', '마드리드', '세비야', '그라나다', 'Barcelona', 'Madrid', 'Seville', 'Granada',
    '독일', 'Germany', '베를린', '뮌헨', '프랑크푸르트', 'Berlin', 'Munich', 'Frankfurt',
    '포르투갈', 'Portugal', '리스본', '포르투', 'Lisbon', 'Porto',
    '네덜란드', 'Netherlands', '암스테르담', 'Amsterdam',
    '벨기에', 'Belgium', '브뤼셀', 'Brussels',
    '오스트리아', 'Austria', '비엔나', '잘츠부르크', 'Vienna', 'Salzburg',
    '그리스', 'Greece', '아테네', '산토리니', 'Athens', 'Santorini',
    '아일랜드', 'Ireland', '더블린', 'Dublin',
    '핀란드', 'Finland', '헬싱키', 'Helsinki',
    '크로아티아', 'Croatia', '두브로브니크', '자그레브', 'Dubrovnik', 'Zagreb',
    '슬로베니아', 'Slovenia', '몰타', 'Malta', '룩셈부르크', 'Luxembourg', '에스토니아', 'Estonia', '라트비아', 'Latvia', '리투아니아', 'Lithuania', '슬로바키아', 'Slovakia', '모나코', 'Monaco',
  ],
};

const INDEX: [string, string][] = Object.entries(PLACES)
  .flatMap(([cur, names]) => names.map((n) => [n.toLowerCase(), cur] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

/** 짧은 영어 약어(LA, UK)는 단어 전체가 맞을 때만 본다 */
const wordOnly = (name: string) => /^[a-z]{1,3}$/.test(name);

/** 나라나 도시 이름(또는 '일본 도쿄도 …' 같은 주소)에서 통화를 찾는다. 모르면 null. */
export function currencyOfPlace(text: string): string | null {
  const s = text.toLowerCase();
  for (const [name, cur] of INDEX) {
    if (wordOnly(name) ? new RegExp(`(^|[^a-z])${name}([^a-z]|$)`).test(s) : s.includes(name)) return cur;
  }
  return null;
}

/** 이미 통화 코드(USD)를 적었으면 그대로 */
export function currencyFromInput(text: string): string | null {
  const t = text.trim();
  const code = /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : null;
  if (code && code in PLACES) return code;
  return currencyOfPlace(t) ?? code;
}

/** 입력·보기에 쓸 통화들: 기준 통화(원화), 현지 통화, 달러 */
export function currencyChoices(trip: Pick<Trip, 'baseCurrency' | 'localCurrency'>): string[] {
  return [...new Set([trip.baseCurrency, trip.localCurrency, 'USD'].filter((c): c is string => !!c))];
}

/** 새 비용의 기본 통화: 여행 중이면 현지 통화, 준비 단계(여행 전)면 기준 통화 */
export function defaultCurrencyOf(trip: Pick<Trip, 'baseCurrency' | 'localCurrency' | 'startDate'>, today?: string): string {
  return today && today >= trip.startDate && trip.localCurrency ? trip.localCurrency : trip.baseCurrency;
}

/** 기준 통화 금액을 다른 통화로. 환율을 모르면 null. */
export function fromBase(amount: number, cur: string, trip: Pick<Trip, 'baseCurrency' | 'rates'>): number | null {
  if (cur === trip.baseCurrency) return amount;
  const r = trip.rates[cur];
  return r ? amount / r : null;
}
