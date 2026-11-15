// 실제 기기 연결: 파일 앱에서 구글 테이크아웃 파일(JSON·CSV)을 골라 글로 읽는다.
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';

export async function pickSavedFiles(): Promise<{ name: string; text: string }[]> {
  const res = await getDocumentAsync({ type: ['application/json', 'text/csv', 'text/comma-separated-values', 'public.json', '*/*'], multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return Promise.all(res.assets.map(async (a) => ({ name: a.name, text: await new File(a.uri).text() })));
}
