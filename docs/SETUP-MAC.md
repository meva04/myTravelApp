# 맥에서 내 아이폰에 설치하기

개발 경험이 없어도 따라 할 수 있게 순서대로 적었습니다. 터미널 명령은 한 줄씩 복사해 실행하세요.

## 1. 한 번만 하는 준비

1. **Xcode**: 맥 앱스토어에서 설치하고 한 번 실행해 추가 구성요소 설치를 마칩니다.
2. **Node.js**: https://nodejs.org 에서 LTS 버전을 설치합니다.
3. **저장소 내려받기** (주소는 본인 깃허브 저장소로 바꿉니다):

```bash
git clone https://github.com/<내-계정>/<저장소-이름>.git
```

```bash
cd <저장소-이름>
```

```bash
npm install
```

4. **패키지 버전 확인**: 개발 환경에서는 엑스포 서버에 접속할 수 없어 버전을 수동으로 맞췄습니다. 맥에서 한 번 확인합니다. 고칠 것이 있다고 나오면 `npx expo install --fix` 를 실행합니다.

```bash
npx expo install --check
```

## 2. 구글 지도 키 발급

1. https://console.cloud.google.com 에서 프로젝트를 만들고 결제 계정(카드)을 등록합니다.
2. "API 및 서비스 → 라이브러리"에서 세 가지를 사용 설정합니다.
   - Maps SDK for iOS
   - Places API (New)
   - Routes API
3. "사용자 인증 정보 → API 키 만들기"로 키를 만듭니다.
4. 키 설정에서 **API 제한**을 위 세 가지로만 제한합니다.
5. "할당량"에서 Places API와 Routes API의 **일일 한도**를 낮게(예: 하루 500건) 걸어 예상치 못한 요금을 막습니다.
6. 프로젝트 폴더에서 `.env.example` 을 `.env` 로 복사하고 키를 붙여넣습니다. `.env` 는 깃허브에 올라가지 않습니다.

```bash
cp .env.example .env
```

## 3-0. 먼저 맥의 시뮬레이터로 해보기 (애플 계정·아이폰 불필요)

Xcode에 들어 있는 가상 아이폰에서 바로 실행합니다. 처음 한 번은 빌드에 10분 이상 걸릴 수 있습니다.

```bash
npx expo run:ios
```

시뮬레이터에서 확인할 수 있는 것과 없는 것:

| 확인 가능 | 방법 |
|---|---|
| 여행 만들기, 일정 편집, 끌어서 순서 바꾸기 | 그대로 |
| 장소 검색, 실제 길을 따라 그려지는 경로, 지도 확대 유지 | 그대로 (`.env`에 구글 키 필요) |
| 사진 첨부 | 사진첩에서 고르기. 맥의 사진을 시뮬레이터 창에 끌어다 놓으면 사진첩에 들어감 |
| 현재 위치 | 시뮬레이터 메뉴 Features → Location → Custom Location 에서 좌표 입력 |
| 도착 감지(대략) | 위치를 일정에 있는 장소 좌표로 바꿔 보기. 감지가 늦거나 안 될 수 있음 |

| 시뮬레이터로는 안 되는 것 | |
|---|---|
| 촬영 | 시뮬레이터에 카메라가 없음 |
| 실제로 걸어서 하는 도착 감지, 앱을 완전히 끈 상태의 감지 | 실제 아이폰에서만 정확함 |

## 3. 아이폰에 설치

이 앱은 백그라운드 위치와 구글 지도를 쓰기 때문에 "Expo Go" 앱으로는 실행할 수 없고, 전용 개발 빌드를 설치해야 합니다.

**방법 A — 맥에서 직접 (빠름)**: 아이폰을 케이블로 연결하고 실행합니다. 처음에는 Xcode에서 본인 애플 계정으로 서명을 설정하라는 안내가 나옵니다.

```bash
npx expo run:ios --device
```

**방법 B — 클라우드 빌드 (스토어 제출과 같은 방식)**: 애플 개발자 프로그램(연 99달러) 가입이 필요합니다.

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build --profile development --platform ios
```

빌드가 끝나면 나오는 QR 코드로 아이폰에 설치합니다.

설치 후 개발 서버를 켜고 아이폰에서 앱을 엽니다.

```bash
npx expo start --dev-client
```

## 4. 처음 실행해서 확인할 것

아래는 개발 환경에서 확인할 수 없었던 항목입니다. 문제가 있으면 화면과 함께 알려주세요.

- [ ] 장소 검색이 되고 결과를 누르면 일정에 추가된다 (구글 Places 연결)
- [ ] 지도에 경로가 **실제 길을 따라** 그려진다 (구글 Routes 연결)
- [ ] 지도를 확대한 뒤 다른 구간이나 장소를 눌러도 **화면이 움직이지 않는다**
- [ ] 선택한 곳이 화면 밖이면 "여기로 이동"이 뜨고, 누르면 확대 수준은 그대로인 채 이동한다
- [ ] "전체 보기"를 누르면 하루 경로 전체가 보인다
- [ ] 일정 목록에서 카드를 길게 눌러 끌면 순서가 바뀐다
- [ ] 설정에서 "위치 권한 요청"을 눌러 위치를 "항상 허용", 알림을 "허용"으로 준 뒤, 가까운 곳 두 군데를 일정에 넣고 걸어가면 도착 알림이 오고 스탬프가 찍힌다
- [ ] 위 확인을 **앱을 완전히 종료한 상태**(앱 전환기에서 위로 밀어 끄기)로 한 번 더 해본다
- [ ] 장소 번호 표시를 눌러도 지도가 움직이지 않고 선택만 된다
- [ ] 사진첩에서 고른 사진과 촬영한 사진이 장소에 붙는다
- [ ] 비행기 모드에서도 저장된 일정·경로·기록이 보인다

## 5. 맥에서 겪은 문제와 해결법

- `pod` 명령이 없다 → `brew install cocoapods`
- pod install 에서 `Unicode Normalization not appropriate for ASCII-8BIT` → 명령 앞에 `LANG=en_US.UTF-8` 을 붙인다.
- pod install 에서 SSL `certificate verify failed` → 명령 앞에 `SSL_CERT_FILE=/opt/homebrew/share/ca-certificates/cacert.pem` 을 붙인다. (이 오류가 날 때만)
- 첫 빌드에서 `Scanning for @ExpoModule classes didn't complete ... timed out` → 같은 명령으로 한 번 더 빌드하면 통과한다.
- 시뮬레이터 앱이 `Could not connect to the server` 로 개발 서버에 못 붙는다 → `REACT_NATIVE_PACKAGER_HOSTNAME=localhost` 를 붙여 빌드한다.

시뮬레이터 빌드는 보통 이렇게 한다.

```bash
LANG=en_US.UTF-8 REACT_NATIVE_PACKAGER_HOSTNAME=localhost npx expo run:ios
```

## 6. 코드를 받아온 뒤 다시 빌드해야 하는지

`src/` 만 바뀌었으면 빌드할 필요 없다. 개발 서버만 켜면 시뮬레이터 앱에 바로 반영된다.

```bash
npx expo start --dev-client --localhost
```

아래 명령에서 파일 이름이 나오면 다시 빌드해야 한다. 번들 ID·플러그인이 바뀌었으면 `npx expo prebuild --clean -p ios` 부터 한다.

```bash
git diff --name-only HEAD@{1} HEAD | grep -E 'package.json|app.json|app.config.js'
```

## 7. 여러 맥에서 아이폰 릴리즈 빌드

릴리즈 빌드는 개발 서버 없이 아이폰에서 혼자 돌아간다. 어느 맥에서 빌드해도 같은 인증서·팀으로 서명되므로 같은 앱으로 덮어 설치되고 데이터도 남는다.

### 맥마다 한 번만

1. **인증서**: `.p12` 파일을 더블클릭하고 로그인 키체인에 비밀번호를 넣어 설치한다. `.p12` 는 저장소에 절대 넣지 않는다.
2. **애플 중간 인증서**: 아래 명령에서 `0 valid identities` 가 나오면 https://www.apple.com/certificateauthority/ 에서 "Worldwide Developer Relations - G3" 를 받아 더블클릭한다.

```bash
security find-identity -v -p codesigning
```

3. **Xcode 계정**: Xcode → 설정 → Accounts 에 애플 계정으로 로그인하고 팀 `NFJTNBHS3J` 가 보이는지 확인한다. 안 보이면 로그아웃 후 다시 로그인한다.
4. **아이폰 페어링**: 케이블로 연결해 아이폰에서 "신뢰"를 누른 뒤 아래를 실행하고 아이폰에서 허용한다. UDID 는 `xcrun devicectl list devices` 로 본다.

```bash
xcrun devicectl manage pair --device <아이폰-UDID>
```

### 빌드할 때마다

`npx expo run:ios --configuration Release --device` 는 프로비저닝 프로필을 자동으로 받지 못해 실패한다. `xcodebuild` 로 직접 빌드한다.

```bash
cd ios && pod install && LANG=en_US.UTF-8 xcodebuild -workspace tripnote.xcworkspace -scheme tripnote -configuration Release -destination 'generic/platform=iOS' -derivedDataPath DerivedData -allowProvisioningUpdates build
```

```bash
xcrun devicectl device install app --device <아이폰-UDID> DerivedData/Build/Products/Release-iphoneos/tripnote.app
```

- 빌드 결과는 `ios/DerivedData` 에 둔다. `ios/build` 에는 React Native 가 만든 코드(`ios/build/generated`)가 있어서 지우면 빌드가 깨진다. 공간이 필요하면 `ios/DerivedData` 만 지운다. 실수로 `ios/build` 를 지웠으면 `cd ios && LANG=en_US.UTF-8 pod install` 로 다시 만든다.
- 무료 팀이라 설치한 앱은 **7일 뒤 만료**된다. 만료 전에 다시 빌드해 설치하면 데이터는 그대로 남는다.
- 설치하는 동안 아이폰 잠금을 풀어 둔다.

### 아이폰 앱 데이터를 맥으로 가져오기 (개발용 서명 앱만 가능)

```bash
xcrun devicectl device copy from --device <아이폰-UDID> --domain-type appDataContainer --domain-identifier com.raytripnote.app --source Documents --destination ~/Developer/myTravelApp-iphone-backup/$(date +%F)/Documents
```

여행 데이터는 `Documents/SQLite/tripnote.db`, 사진은 `Documents/photos/` 에 있다.
