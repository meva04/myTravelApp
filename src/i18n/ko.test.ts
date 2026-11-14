import { t } from './ko';

test('t returns the Korean string for a key', () => {
  expect(t('common.ok')).toBe('확인');
});
