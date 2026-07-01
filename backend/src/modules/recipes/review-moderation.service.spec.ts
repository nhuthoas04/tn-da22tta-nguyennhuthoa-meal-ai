import { ReviewModerationService } from './review-moderation.service';
import { INAPPROPRIATE_REVIEW_TEXT } from './bad-words';

describe('ReviewModerationService', () => {
  const service = new ReviewModerationService();

  it('does not flag normal Vietnamese cooking comments', () => {
    const result = service.filterBadWords(
      'Món này rất ngon, đủ cho các phần ăn lớn.',
    );

    expect(result.isViolating).toBe(false);
    expect(result.censoredText).toBe(
      'Món này rất ngon, đủ cho các phần ăn lớn.',
    );
  });

  it('flags banned words without case sensitivity', () => {
    const result = service.filterBadWords('Món này như LỒN');

    expect(result.isViolating).toBe(true);
    expect(result.matchedWords).toContain('như lồn');
    expect(result.censoredText).toBe(INAPPROPRIATE_REVIEW_TEXT);
  });

  it.each([
    ['như con c', 'như con c'],
    ['NHƯ CON C', 'như con c'],
    ['nhu con c', 'nhu con c'],
    ['như con c.', 'như con c'],
    ['như, con c', 'như con c'],
    ['như cc', 'như cc'],
    ['cc', 'cc'],
  ])('flags Vietnamese contextual profanity: %s', (input, expectedWord) => {
    const result = service.filterBadWords(input);

    expect(result.isViolating).toBe(true);
    expect(result.matchedWords).toContain(expectedWord);
    expect(result.censoredText).toBe(INAPPROPRIATE_REVIEW_TEXT);
  });

  it('does not flag the letter c outside profane context', () => {
    const result = service.filterBadWords('Vitamin C giúp món ăn cân bằng hơn');

    expect(result.isViolating).toBe(false);
  });

  it('flags common obfuscated banned words', () => {
    const result = service.filterBadWords('d.m món này');

    expect(result.isViolating).toBe(true);
    expect(result.matchedWords).toContain('dm');
  });

  it('accepts an empty review for star-only ratings', () => {
    const result = service.filterBadWords('');

    expect(result).toEqual({
      isViolating: false,
      censoredText: '',
      matchedWords: [],
    });
  });
});
