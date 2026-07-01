import { INAPPROPRIATE_REVIEW_TEXT } from './bad-words';
import { ReviewModerationService } from './review-moderation.service';

describe('ReviewModerationService', () => {
  const service = new ReviewModerationService();

  it.each([
    'món ngon',
    'món hơi mặn',
    'nấu chưa hợp khẩu vị',
    'món này cần cải thiện',
    'không ngon lắm nhưng vẫn ổn',
    'Món này rất ngon, đủ cho các phần ăn lớn.',
    'Database công thức đang hoạt động ổn định',
    'Vitamin C giúp món ăn cân bằng hơn',
  ])('does not flag a normal review: %s', (input) => {
    const result = service.filterBadWords(input);

    expect(result.isViolating).toBe(false);
    expect(result.censoredText).toBe(input);
    expect(result.matchedWords).toEqual([]);
  });

  it.each([
    ['như cứt', 'nhu cut'],
    ['Như cứt.', 'nhu cut'],
    ['nhu cut', 'nhu cut'],
    ['đỡ như db', 'do nhu db'],
    ['ĐỠ NHƯ DB.', 'do nhu db'],
    ['như đb', 'nhu db'],
    ['đ b', 'db'],
    ['như con c', 'nhu con c'],
    ['NHƯ, CON C.', 'nhu con c'],
    ['cc', 'cc'],
    ['món như cứt', 'mon nhu cut'],
    ['nấu như cứt', 'nau nhu cut'],
    ['ngu', 'ngu'],
    ['óc chó', 'oc cho'],
    ['đồ ngu', 'do ngu'],
    ['mất dạy', 'mat day'],
    ['xàm l', 'xam l'],
    ['vcl', 'vcl'],
    ['đm', 'dm'],
    ['d m', 'dm'],
    ['cặc', 'cặc'],
    ['lồn', 'lồn'],
    ['đụ', 'đụ'],
    ['chó', 'chó'],
  ])('flags inappropriate Vietnamese content: %s', (input, expectedWord) => {
    const result = service.filterBadWords(input);

    expect(result.isViolating).toBe(true);
    expect(result.matchedWords).toContain(expectedWord);
    expect(result.censoredText).toBe(INAPPROPRIATE_REVIEW_TEXT);
  });

  it('accepts an empty review for star-only ratings', () => {
    expect(service.filterBadWords('')).toEqual({
      isViolating: false,
      censoredText: '',
      matchedWords: [],
    });
  });
});
