# tripnote (가칭)

계획 → 실행 → 기록이 하나로 이어지는 여행 노트 앱. 엑스포(리액트 네이티브)로 만든 아이폰 앱입니다.

- 설계: `docs/superpowers/specs/2026-11-14-travel-journal-app-design.md`
- 맥에서 내 아이폰에 설치하기: `docs/SETUP-MAC.md`
- 앱스토어 출시 체크리스트: `docs/STORE-CHECKLIST.md`

## 폴더

| 폴더 | 내용 |
|---|---|
| `src/theme/tokens.ts` | 색·글꼴·간격. 디자인을 바꿀 때 여기부터 |
| `src/i18n/ko.ts` | 화면에 나오는 모든 문구 |
| `src/ui` | 버튼·카드·스탬프 같은 기본 부품 |
| `src/screens` | 화면 |
| `src/app` | 화면 주소(라우팅) |
| `src/domain` | 화면과 무관한 규칙 (지도 카메라, 일정 순서, 비용 합계, 도착 판정) |
| `src/map`, `src/google`, `src/location`, `src/records`, `src/db` | 지도, 구글 연결, 도착 감지, 사진, 저장 |

## 검사

```bash
npm test
```

```bash
npm run typecheck
```
