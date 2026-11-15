// 테스트 전용: 날짜·시간 선택기를 열고 값을 고른 뒤 확인을 누른다.
import { fireEvent, screen } from '@testing-library/react-native';

async function pick(label: string, isoLocal: string, index = 0) {
  await fireEvent.press((await screen.findAllByLabelText(label))[index]);
  await fireEvent.changeText(screen.getByLabelText(`${label} 선택기`), isoLocal);
  await fireEvent.press(screen.getByText('선택 완료'));
}

/** 'HH:mm' 고르기 */
export const pickTime = (label: string, hhmm: string, index = 0) => pick(label, `2027-01-01T${hhmm}`, index);
/** 'YYYY-MM-DD' 고르기 */
export const pickDate = (label: string, ymd: string, index = 0) => pick(label, `${ymd}T00:00`, index);
