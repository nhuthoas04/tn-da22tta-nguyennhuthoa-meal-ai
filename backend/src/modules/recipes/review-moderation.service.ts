import { Injectable } from '@nestjs/common';
import {
  BAD_WORDS,
  INAPPROPRIATE_REVIEW_TEXT,
} from './bad-words';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class ReviewModerationService {
  normalizeText(text = ''): string {
    return text
      .normalize('NFC')
      .toLowerCase()
      .replace(/0/g, 'o')
      .replace(/3/g, 'e')
      .replace(/[1!]/g, 'i')
      .replace(/@/g, 'a')
      .replace(/7/g, 't')
      .replace(/[*_.-]+/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  filterBadWords(text = ''): {
    isViolating: boolean;
    censoredText: string;
    matchedWords: string[];
  } {
    const normalizedText = this.normalizeText(text);
    if (!normalizedText) {
      return {
        isViolating: false,
        censoredText: '',
        matchedWords: [],
      };
    }

    const matchedWords = BAD_WORDS.filter((badWord) => {
      const normalizedBadWord = this.normalizeText(badWord);
      const pattern = normalizedBadWord
        .split(' ')
        .map(escapeRegExp)
        .join('\\s+');
      return new RegExp(`(?:^|\\s)${pattern}(?=\\s|$)`, 'u').test(
        normalizedText,
      );
    });

    return {
      isViolating: matchedWords.length > 0,
      censoredText:
        matchedWords.length > 0 ? INAPPROPRIATE_REVIEW_TEXT : text.trim(),
      matchedWords: [...matchedWords],
    };
  }
}
