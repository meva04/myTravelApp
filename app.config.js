// app.json 의 설정에 구글 지도 키를 더한다. 키는 .env 의 EXPO_PUBLIC_GOOGLE_API_KEY 에서 읽으며 저장소에 올리지 않는다.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', { iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY ?? '' }],
  ],
});
