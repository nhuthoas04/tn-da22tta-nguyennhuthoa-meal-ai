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
    expect(result.matchedWords).toContain('lồn');
    expect(result.censoredText).toBe(INAPPROPRIATE_REVIEW_TEXT);
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
