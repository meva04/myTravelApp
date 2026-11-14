// 앱의 진짜 시작점. iOS 가 백그라운드에서 앱을 깨울 때는 화면이 그려지지 않으므로,
// 도착 감지 태스크는 화면(라우터)보다 먼저 이 파일에서 등록해야 한다.
import './src/location/geofence';
import 'expo-router/entry';
