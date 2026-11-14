# 여행 노트 앱 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 해외여행 일정을 짜고, 실제 길을 따라 경로를 보고, 도착·사진·메모·비용이 쌓여 일기가 되는 아이폰 앱을 앱스토어에 제출 가능한 상태로 만든다.

**Architecture:** 엑스포(리액트 네이티브) 앱. 화면과 무관한 규칙(일정 순서, 지도 카메라, 도착 감지 대상 선정, 비용 합계)은 순수 함수로 `src/domain`에 두고 jest로 검증한다. 저장은 기기 내 SQLite를 얇은 `Db` 인터페이스 뒤에 두어 테스트에서는 better-sqlite3로 대체한다. 구글 API는 `fetch`를 주입받는 클라이언트로 감싼다.

**Tech Stack:** Expo(최신 SDK, `create-expo-app`이 주는 버전) · TypeScript · expo-router · expo-sqlite · react-native-maps(구글 제공자) · expo-location + expo-task-manager · expo-notifications · expo-image-picker · react-native-reanimated · @gorhom/bottom-sheet · react-native-draggable-flatlist · jest-expo · better-sqlite3(테스트 전용). 엑스포 패키지는 모두 `npx expo install`로 설치해 SDK 호환 버전을 받는다.

**Spec:** `docs/superpowers/specs/2026-11-14-travel-journal-app-design.md`

## Global Constraints

- 프로젝트 폴더와 가칭: `tripnote`. 앱 이름과 번들 ID는 미정 — `app.json`에 `com.example.tripnote` 자리표시자로 두고 Task 12에서 사용자에게 받아 확정한다.
- 지도는 처음 열 때, "전체 보기", "현재 위치", "여기로 이동"을 누를 때만 스스로 움직인다. 그 외 어떤 코드도 카메라를 움직이지 않는다.
- 경로는 구글 Routes API가 준 선 좌표로 그린다. 직선 연결 금지 (받아오기 전에는 선을 그리지 않고 "경로 불러오는 중" 표시).
- 구글 장소 정보 중 장소 ID·이름·좌표만 DB에 저장한다. 별점·사진·영업시간은 메모리에만 둔다.
- 도착 반경 기본 150m, 동시 감시 최대 20곳.
- 화면 문구는 한국어, 모두 `src/i18n/ko.ts`에 둔다. 컴포넌트에 문자열을 직접 쓰지 않는다.
- 색·글꼴·간격은 `src/theme/tokens.ts`에서만 가져온다 (시각 디자인은 별도 시안 작업에서 이 파일을 교체).
- 구글 API 키는 `EXPO_PUBLIC_GOOGLE_API_KEY` 환경변수로 읽는다. 저장소에 커밋하지 않는다 (`.env`는 `.gitignore`).
- 1단계 범위 밖: 길 고르기, 사진 자동 연결, 문자 인식, 위젯·다이나믹 아일랜드, 회원·서버.

## Review Focus

1. **네트워크 없음** (해외 데이터 끊김): 저장된 일정·경로·기록은 그대로 보이고, 장소 정보와 새 경로만 "연결되면 다시 시도" 상태가 된다. → Task 5, Task 9
2. **위치 권한이 "항상 허용"이 아님**: 앱이 죽지 않고 수동 "도착" 체크로 동작하며 설정 화면에 안내가 뜬다. → Task 7, Task 11
3. **같은 장소에 다시 들어옴 / 도착 이벤트 중복**: 첫 도착 시간을 덮어쓰지 않는다. → Task 7
4. **방문지가 0개 또는 1개인 날, 21개 이상인 날**: 구간 없음으로 정상 표시, 감시 대상은 가까운 20곳만. → Task 4, Task 7
5. **환율이 입력되지 않은 통화의 비용**: 합계에서 빼지 않고 "환산 안 됨" 금액으로 따로 보여준다. → Task 3

---

### Task 1: 프로젝트 뼈대

**Files:**
- Create: `tripnote/` (`npx create-expo-app@latest tripnote --template default`), `tripnote/jest.config.js`, `tripnote/.env.example`, `tripnote/src/theme/tokens.ts`, `tripnote/src/i18n/ko.ts`
- Move: `docs/` → `tripnote/docs/`

**Produces:** `tokens` (`colors`, `fonts`, `space`, `radius` 객체), `t(key: keyof typeof ko): string`

- [ ] Step 1: 앱 생성, 템플릿 예제 화면 삭제, `git init`
- [ ] Step 2: `npx expo install jest-expo jest @types/jest`, `npm i -D better-sqlite3 @types/better-sqlite3`; `package.json`에 `"test": "jest"`, `"typecheck": "tsc --noEmit"`
- [ ] Step 3: `tokens.ts`에 임시 값(종이색 배경 `#F6F1E7`, 잉크색 `#2B2A28`, 강조 `#C8553D`), `ko.ts`에 `t()` 작성
- [ ] Step 4: 테스트 `src/i18n/ko.test.ts` — `expect(t('common.ok')).toBe('확인')`
- [ ] Step 5: Run `npm test && npm run typecheck` → PASS
- [ ] Step 6: Commit `chore: scaffold expo app`

### Task 2: 데이터 모양과 저장소

**Files:**
- Create: `src/domain/types.ts`, `src/db/Db.ts`, `src/db/schema.ts`, `src/db/repo.ts`, `src/db/expoDb.ts`, `src/db/testDb.ts`
- Test: `src/db/repo.test.ts`

**Produces:**

```ts
// types.ts
type Id = string;
type LatLng = { lat: number; lng: number };
type TravelMode = 'walk' | 'transit' | 'drive';
type Category = 'food' | 'transport' | 'shopping' | 'ticket' | 'lodging' | 'etc';
type Trip = { id: Id; name: string; city: string; startDate: string; endDate: string;
              baseCurrency: string; rates: Record<string, number> }; // rates[cur] = 1 cur가 기준통화로 얼마
type Day = { id: Id; tripId: Id; date: string };                    // date: 'YYYY-MM-DD'
type Stop = { id: Id; dayId: Id; order: number; placeId: string | null; name: string;
              lat: number; lng: number; plannedTime: string | null;  // 'HH:mm'
              arrivedAt: string | null; arrivalMethod: 'auto' | 'manual' | null; memo: string };
type RouteOption = { id: Id; kind: 'default'; polyline: LatLng[];
                     distanceMeters: number; durationSeconds: number };
type Leg = { id: Id; fromStopId: Id; toStopId: Id; mode: TravelMode;
             options: RouteOption[]; selectedOptionId: Id | null };
type Photo = { id: Id; stopId: Id; uri: string; takenAt: string; lat: number | null; lng: number | null };
type Expense = { id: Id; tripId: Id; date: string; stopId: Id | null; amount: number;
                 currency: string; category: Category; memo: string };

// Db.ts
interface Db { run(sql: string, params?: unknown[]): Promise<void>;
               all<T>(sql: string, params?: unknown[]): Promise<T[]>; }

// repo.ts — makeRepo(db: Db) 가 돌려주는 것
migrate(): Promise<void>
createTrip(input: Omit<Trip,'id'|'rates'>): Promise<Trip>   // startDate~endDate의 Day도 함께 생성
listTrips(): Promise<Trip[]>;  getTrip(id): Promise<Trip|null>;  updateTrip(t: Trip): Promise<void>;  deleteTrip(id): Promise<void>
listDays(tripId): Promise<Day[]>
listStops(dayId): Promise<Stop[]>            // order 오름차순
saveStops(dayId, stops: Stop[]): Promise<void> // 그 날의 방문지를 통째로 교체
updateStop(s: Stop): Promise<void>
listLegs(dayId): Promise<Leg[]>;  saveLegs(dayId, legs: Leg[]): Promise<void>
addPhoto(p: Omit<Photo,'id'>): Promise<Photo>;  listPhotos(stopId): Promise<Photo[]>;  deletePhoto(id): Promise<void>
addExpense(e: Omit<Expense,'id'>): Promise<Expense>;  listExpenses(tripId): Promise<Expense[]>
updateExpense(e: Expense): Promise<void>;  deleteExpense(id): Promise<void>
```

`rates`, `Leg.options`는 JSON 문자열 컬럼. ID는 `expo-crypto`의 `randomUUID()` (테스트에서는 `crypto.randomUUID`). `expoDb.ts`는 expo-sqlite를, `testDb.ts`는 메모리 better-sqlite3를 `Db`로 감싼다.

- [ ] Step 1: 실패하는 테스트 작성
  - `createTrip({startDate:'2027-03-01', endDate:'2027-03-03', ...})` 후 `listDays` 길이 3, 날짜 순서 일치
  - `saveStops` 후 `listStops`가 `order` 순으로 같은 값 반환
  - `saveLegs`에 넣은 `options[0].polyline`이 `listLegs`에서 동일
  - `deleteTrip` 후 그 여행의 Day·Stop·Expense가 모두 0건
- [ ] Step 2: Run `npx jest src/db` → FAIL
- [ ] Step 3: 구현 (외래키 `ON DELETE CASCADE`, `PRAGMA foreign_keys = ON`)
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `feat: data model and sqlite repository`

### Task 3: 비용 합계

**Files:** Create `src/domain/expenses.ts` · Test `src/domain/expenses.test.ts`

**Produces:**
```ts
type Summary = { total: number;                       // 기준 통화
                 byDate: Record<string, number>; byCategory: Record<Category, number>;
                 byStop: Record<Id, number>;
                 unconverted: Record<string, number> } // 환율 없는 통화별 원금액 합
summarizeExpenses(expenses: Expense[], trip: Trip): Summary
```

- [ ] Step 1: 테스트 — 기준 KRW, `rates {JPY: 9}`; 1000 JPY(food, 3/1) + 5000 KRW(shopping, 3/2) + 20 EUR(etc, 3/2) → `total 14000`, `byDate['2027-03-01'] 9000`, `byCategory.shopping 5000`, `unconverted {EUR: 20}`; 빈 배열 → `total 0`
- [ ] Step 2: Run → FAIL · Step 3: 구현 · Step 4: Run → PASS
- [ ] Step 5: Commit `feat: expense summary`

### Task 4: 일정 편집 규칙

**Files:** Create `src/domain/itinerary.ts` · Test `src/domain/itinerary.test.ts`

**Produces:**
```ts
reorder(stops: Stop[], from: number, to: number): Stop[]        // order를 0..n-1로 다시 매김
moveToDay(stop: Stop, fromStops: Stop[], toStops: Stop[], toDayId: Id): { from: Stop[]; to: Stop[] } // 맨 끝에 추가
syncLegs(stops: Stop[], legs: Leg[], newId: () => Id): Leg[]
```
`syncLegs`: 이웃한 방문지 쌍마다 구간 하나. 같은 `fromStopId→toStopId` 구간이 이미 있으면 그대로 유지(받아둔 경로 보존), 없으면 `{mode:'walk', options:[], selectedOptionId:null}`로 새로 만들고, 쌍이 사라진 구간은 버린다.

- [ ] Step 1: 테스트 — A,B,C에서 `reorder(…,2,0)` → C,A,B·order 0,1,2; `syncLegs` 결과가 C→A, A→B 두 개이고 A→B는 기존 `options` 유지; 방문지 0개·1개 → `[]`; `moveToDay` 후 양쪽 order 연속
- [ ] Step 2–4: FAIL → 구현 → PASS
- [ ] Step 5: Commit `feat: itinerary editing rules`

### Task 5: 구글 장소·경로 클라이언트

**Files:** Create `src/google/polyline.ts`, `src/google/places.ts`, `src/google/routes.ts`, `src/google/errors.ts` · Test `src/google/*.test.ts`

**Produces:**
```ts
decodePolyline(encoded: string): LatLng[]
class OfflineError extends Error {}  class GoogleApiError extends Error { status: number }
type PlaceHit = { placeId: string; name: string; address: string; lat: number; lng: number };
type PlaceDetails = PlaceHit & { rating: number | null; ratingCount: number | null;
  openingHours: string[]; website: string | null; photoUrls: string[] };
makePlaces(fetchFn: typeof fetch, apiKey: string): {
  search(query: string, near?: LatLng): Promise<PlaceHit[]>;     // POST places:searchText
  details(placeId: string): Promise<PlaceDetails> }               // GET places/{id}, 10분 메모리 캐시
makeRoutes(fetchFn: typeof fetch, apiKey: string): {
  compute(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteOption> } // POST directions/v2:computeRoutes
```
`mode` 매핑: walk→`WALK`, transit→`TRANSIT`, drive→`DRIVE`. 필드 마스크는 필요한 필드만 요청한다. `fetch`가 던지면 `OfflineError`, 200이 아니면 `GoogleApiError`. 구현 전 구글 공식 문서에서 현재 요청·응답 형식을 확인한다.

- [ ] Step 1: 테스트 — `decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')` → `[{38.5,-120.2},{40.7,-120.95},{43.252,-126.453}]`; 가짜 fetch 응답으로 `search`·`details`·`compute` 결과 매핑 확인; fetch가 `TypeError`를 던지면 `OfflineError`; 403이면 `GoogleApiError(status 403)`; `details` 두 번 호출 시 fetch 한 번
- [ ] Step 2–4: FAIL → 구현 → PASS
- [ ] Step 5: Commit `feat: google places and routes clients`

### Task 6: 지도 카메라 규칙

**Files:** Create `src/domain/camera.ts` · Test `src/domain/camera.test.ts`

**Produces:**
```ts
type Region = { lat: number; lng: number; latDelta: number; lngDelta: number };
type CameraEvent =
  | { type: 'dayOpened'; points: LatLng[] } | { type: 'fitAll'; points: LatLng[] }
  | { type: 'goToMe'; me: LatLng } | { type: 'goToTarget'; target: LatLng }
  | { type: 'userMoved'; region: Region } | { type: 'selected' };
nextRegion(current: Region | null, e: CameraEvent): Region | null  // null = 지도를 움직이지 말 것
fitRegion(points: LatLng[]): Region            // 여백 20%; 점 1개면 delta 0.01; 0개면 호출하지 않음
isOffscreen(p: LatLng, r: Region): boolean
bearingTo(r: Region, p: LatLng): number        // 화면 중심 → 대상, 도(0=북)
```
`selected`는 항상 `null`. `goToMe`·`goToTarget`은 현재 `latDelta/lngDelta`를 유지하고 중심만 바꾼다. `dayOpened`는 `current === null`일 때만 `fitRegion`을 돌려주고 이후에는 `null`.

- [ ] Step 1: 위 문장 각각을 단언하는 테스트 + 점 0개인 `dayOpened` → `null`
- [ ] Step 2–4: FAIL → 구현 → PASS
- [ ] Step 5: Commit `feat: map camera rules`

### Task 7: 도착 감지

**Files:** Create `src/domain/arrival.ts`, `src/location/geofence.ts`, `src/location/permissions.ts` · Test `src/domain/arrival.test.ts`

**Produces:**
```ts
distanceMeters(a: LatLng, b: LatLng): number
pickRegions(stops: Stop[], here: LatLng | null, max = 20, radius = 150):
  { identifier: Id; latitude: number; longitude: number; radius: number }[]
  // arrivedAt이 null인 방문지만. here가 있으면 가까운 순, 없으면 order 순
markArrived(stop: Stop, at: string, method: 'auto' | 'manual'): Stop  // 이미 arrivedAt이 있으면 그대로 반환
// geofence.ts
GEOFENCE_TASK = 'tripnote-arrival'
refreshGeofences(repo, today: string): Promise<void>   // 오늘 Day의 방문지로 pickRegions → startGeofencingAsync
// permissions.ts
type LocationAccess = 'always' | 'whenInUse' | 'denied';
getLocationAccess(): Promise<LocationAccess>;  requestAlways(): Promise<LocationAccess>
```
백그라운드 태스크(`TaskManager.defineTask`)는 진입 이벤트에서 `markArrived(…,'auto')` → `repo.updateStop` → 알림("{이름}에 도착했어요") → `refreshGeofences`. 태스크 정의는 앱 진입 파일의 최상위에서 import한다. `getLocationAccess()`가 `'always'`가 아니면 `refreshGeofences`는 아무것도 등록하지 않고 정상 반환한다.

- [ ] Step 1: 테스트 — 방문지 25개(5개는 도착함) → 20개, 모두 미도착, 가까운 순, radius 150; `here=null`이면 order 순; `markArrived`를 두 번 부르면 첫 시각 유지; 서울시청–광화문 `distanceMeters`가 약 700m(±100)
- [ ] Step 2–4: FAIL → 구현 → PASS
- [ ] Step 5: Commit `feat: arrival detection`

### Task 8: 여행 목록 · 여행 홈 · 일정 편집 화면

**Files:** Create `app/_layout.tsx`, `app/index.tsx`, `app/trip/new.tsx`, `app/trip/[tripId]/index.tsx`, `app/trip/[tripId]/day/[dayId]/add.tsx`, `src/state/AppProvider.tsx`(repo·places·routes 제공), `src/ui/{Screen,Button,TextField,Card}.tsx`
**Test:** `app/__tests__/trips.test.tsx` (@testing-library/react-native, `testDb`)

**Consumes:** Task 2 repo, Task 4 `reorder`/`moveToDay`/`syncLegs`, Task 5 `places.search`

- [ ] Step 1: 테스트 — 여행 없을 때 빈 상태 문구; 이름·도시·날짜·통화 입력 후 저장하면 목록에 표시; 여행 홈에 날짜 탭이 일수만큼
- [ ] Step 2: FAIL 확인
- [ ] Step 3: 구현 — 여행 홈은 날짜 탭 + 하루 요약(방문지 수·이동 거리 합·그날 비용) + 그날 방문지 목록(예정 시간·메모 편집, `react-native-draggable-flatlist`로 순서 변경, 스와이프 삭제, "다른 날로 이동"), 장소 추가 화면은 검색어 입력 → 결과 선택 → `saveStops` + `syncLegs` + `saveLegs`. 오프라인이면 검색 화면에 "연결되면 다시 시도" 표시
- [ ] Step 4: Run `npm test && npm run typecheck` → PASS
- [ ] Step 5: Commit `feat: trips and itinerary screens`

### Task 9: 하루 지도 화면

**Files:** Create `app/trip/[tripId]/day/[dayId]/index.tsx`, `src/map/DayMap.tsx`, `src/map/OffscreenHint.tsx`, `src/map/useLegRoutes.ts`, `src/map/mapStyle.json`
**Test:** `src/map/useLegRoutes.test.ts`

**Consumes:** Task 6 전부, Task 5 `routes.compute`, Task 2 `listLegs`/`saveLegs`

**Produces:** `useLegRoutes(dayId): { legs: Leg[]; status: Record<Id,'ready'|'loading'|'offline'|'error'>; setMode(legId, mode): void; retry(): void }` — `options`가 빈 구간만 `compute`해 저장한다. `setMode`는 그 구간의 `options`를 비우고 다시 받는다.

- [ ] Step 1: 테스트 — 이미 `options`가 있는 구간은 `compute` 호출 0번; 빈 구간은 1번 호출 후 `saveLegs`; `compute`가 `OfflineError`면 status `'offline'`이고 기존 구간은 `'ready'` 유지
- [ ] Step 2: FAIL 확인
- [ ] Step 3: 구현 — 위 절반 지도, 아래 `@gorhom/bottom-sheet` 일정 목록. 지도 이동은 오직 `nextRegion`이 `null`이 아닌 값을 줄 때 `animateToRegion`; `onRegionChangeComplete`는 `userMoved`로 전달. 방문지 번호 마커, 구간은 `Polyline`(선택된 구간은 굵게·강조색), 구간 칩에 거리·시간·이동수단 변경. "전체 보기"·"현재 위치" 버튼. 지도를 길게 누르면 그 좌표로 방문지 추가(이름 입력, `placeId null`). 선택 대상이 `isOffscreen`이면 `OffscreenHint`(`bearingTo` 방향 화살표 + "여기로 이동")
- [ ] Step 4: Run `npm test && npm run typecheck` → PASS
- [ ] Step 5: Commit `feat: day map with real-path routes`

### Task 10: 장소 상세와 기록 (스탬프·사진·메모·비용)

**Files:** Create `app/trip/[tripId]/stop/[stopId].tsx`, `src/ui/Stamp.tsx`, `src/records/photos.ts`, `src/ui/ExpenseForm.tsx`, `app/trip/[tripId]/day/[dayId]/here.tsx`
**Test:** `app/__tests__/stop.test.tsx`

**Consumes:** Task 5 `places.details`, Task 7 `markArrived`/`refreshGeofences`, Task 2 사진·비용 함수

**Produces:** `importPhoto(pickerAsset): Promise<Omit<Photo,'id'|'stopId'>>` — 파일을 `FileSystem.documentDirectory + 'photos/'`로 복사하고 EXIF 촬영 시각·좌표를 읽는다(없으면 현재 시각·null).

- [ ] Step 1: 테스트 — 미도착 방문지에서 "도착" 누르면 `arrivedAt` 저장·스탬프 표시(`arrivalMethod 'manual'`); 비용 추가 후 목록과 소계에 반영; `details`가 `OfflineError`여도 내 기록 영역은 렌더됨
- [ ] Step 2: FAIL 확인
- [ ] Step 3: 구현 — 상단 구글 정보(별점·리뷰 수·사진·영업시간·주소·웹사이트, 구글 출처 표기), 하단 내 기록. `Stamp`는 도착 날짜·시간이 들어간 원형 소인, 찍힐 때 Reanimated로 눌림 애니메이션. 도착 시간 수정 가능. `here.tsx`는 현재 위치로 방문지를 즉시 만들고 도착 처리
- [ ] Step 4: Run `npm test && npm run typecheck` → PASS
- [ ] Step 5: Commit `feat: stop detail, stamp, photos, expenses`

### Task 11: 비용 요약 · 설정

**Files:** Create `app/trip/[tripId]/expenses.tsx`, `app/trip/[tripId]/settings.tsx`
**Test:** `app/__tests__/expenses.test.tsx`

**Consumes:** Task 3 `summarizeExpenses`, Task 7 `getLocationAccess`/`requestAlways`

- [ ] Step 1: 테스트 — 요약 화면에 전체·날짜별·분류별 금액; `unconverted`가 있으면 "환산 안 됨" 줄과 환율 입력 링크; 설정에서 `LocationAccess`가 `'whenInUse'`면 "항상 허용" 안내 표시, `'always'`면 숨김
- [ ] Step 2: FAIL 확인
- [ ] Step 3: 구현 — 장소에 묶이지 않는 비용 추가 포함; 설정에서 기준 통화·환율표 편집, 권한 안내(iOS 설정 열기)
- [ ] Step 4: Run → PASS
- [ ] Step 5: Commit `feat: expense summary and settings`

### Task 12: 기기 빌드와 스토어 준비

**Files:** Modify `app.json` · Create `eas.json`, `docs/SETUP-MAC.md`, `docs/STORE-CHECKLIST.md`

- [ ] Step 1: 사용자에게 앱 이름과 번들 ID를 받아 `app.json`에 반영
- [ ] Step 2: `app.json` — `ios.config.googleMapsApiKey`, `UIBackgroundModes: ["location"]`, `NSLocationWhenInUseUsageDescription`·`NSLocationAlwaysAndWhenInUseUsageDescription`("일정에 있는 장소에 도착한 시간을 자동으로 기록하기 위해 위치를 사용합니다"), `NSPhotoLibraryUsageDescription`, `NSCameraUsageDescription`; expo-location·expo-notifications·expo-image-picker 플러그인
- [ ] Step 3: `eas.json`에 `development`(기기용 개발 빌드)·`production` 프로필
- [ ] Step 4: `SETUP-MAC.md` — 개발 지식 없는 사용자용 순서: Node·Xcode 설치, 저장소 내려받기, 구글 클라우드에서 Maps SDK for iOS·Places API (New)·Routes API 켜고 키 발급·API 제한·일일 한도, `.env` 작성, 애플 개발자 등록, `eas build --profile development --platform ios`, 폰에 설치
- [ ] Step 5: `STORE-CHECKLIST.md` — 테스트플라이트, 스크린샷, 설명, 개인정보 처리방침, 백그라운드 위치 심사 답변, 구글 출처 표기, 공개 확대 전 API 키 중계 서버 이전
- [ ] Step 6: Run `npx expo-doctor && npx expo export --platform ios` → 오류 없음
- [ ] Step 7: Commit `chore: device build and store readiness`
- [ ] Step 8: (사용자, 실제 기기) 동네에서 방문지 2곳을 등록하고 걸어가 도착 알림·스탬프 확인, 지도 확대 후 다른 구간 선택 시 화면이 그대로인지 확인
