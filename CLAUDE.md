# Claude 작업 규칙

이 저장소는 집 맥, 회사 맥, 개인 맥북, 핸드폰(claude.ai/code 클라우드 세션)에서 번갈아 작업한다.
세션끼리는 대화를 공유하지 않으므로, 이어가야 할 맥락은 모두 이 저장소 문서에 남긴다.

@AGENTS.md

## 반드시 지킬 것

- 사용자에게 보이는 모든 말(진행 상황 한 줄 포함)은 **한국어**로 쓴다. 코드·명령·파일 이름은 그대로 둔다.
- 작업을 시작하면 먼저 `git pull` 하고 [docs/PROGRESS.md](docs/PROGRESS.md) 를 읽는다.
- 작업을 마치면 `docs/PROGRESS.md` 의 "현재 상태", "다음 할 일", "작업 기록"을 고친다.
- 커밋·푸시는 사용자에게 먼저 묻는다.
- 한 번에 한 곳에서만 고친다. 다른 곳에서 고치는 중이면 pull 후 이어서 한다.
- 글자는 `react-native` 의 `Text`·`TextInput` 대신 `@/ui/Text` 의 것을 쓴다 (한글 단어 단위 줄바꿈, keep-all).

## 문서 위치

- 진행 상황·결정·다음 할 일: [docs/PROGRESS.md](docs/PROGRESS.md)
- 맥 설치·빌드 방법: [docs/SETUP-MAC.md](docs/SETUP-MAC.md)
- 설계: `docs/superpowers/specs/`, 구현 계획: `docs/superpowers/plans/`
- 스토어 출시 점검: [docs/STORE-CHECKLIST.md](docs/STORE-CHECKLIST.md)

## 클라우드 세션(핸드폰)에서 작업할 때

- iOS 시뮬레이터·아이폰 빌드는 할 수 없다. 코드 수정, 테스트(`npx jest`), 타입 검사(`npx tsc --noEmit`)까지만 한다.
- `.env` 가 없으므로 구글 키가 필요한 기능은 실제로 확인할 수 없다. 확인은 맥에서 한다고 PROGRESS 에 적어 둔다.
