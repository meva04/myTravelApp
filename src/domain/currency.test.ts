import { currencyChoices, currencyFromInput, currencyOfPlace, defaultCurrencyOf } from './currency';

test('a country or city name gives its currency', () => {
  expect(currencyOfPlace('도쿄')).toBe('JPY');
  expect(currencyOfPlace('영국 런던 웨스트민스터')).toBe('GBP');
  expect(currencyOfPlace('Barcelona')).toBe('EUR');
  expect(currencyOfPlace('인도네시아 발리')).toBe('IDR'); // '인도' 가 먼저 맞지 않게
  expect(currencyOfPlace('LA')).toBe('USD');
  expect(currencyOfPlace('Palace')).toBeNull(); // 'la' 가 단어 안에 있어도 아니다
  expect(currencyOfPlace('어딘가')).toBeNull();
});

test('a currency code can be typed directly', () => {
  expect(currencyFromInput('usd')).toBe('USD');
  expect(currencyFromInput('UAE')).toBe('AED');
  expect(currencyFromInput('xyz')).toBe('XYZ');
});

test('choices are KRW, local and USD; during the trip the local currency is the default', () => {
  const trip = { baseCurrency: 'KRW', localCurrency: 'JPY', startDate: '2027-03-01' };
  expect(currencyChoices(trip)).toEqual(['KRW', 'JPY', 'USD']);
  expect(defaultCurrencyOf(trip, '2027-02-10')).toBe('KRW'); // 준비 단계
  expect(defaultCurrencyOf(trip, '2027-03-01')).toBe('JPY');
});
