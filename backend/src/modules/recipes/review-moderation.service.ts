import { Injectable } from '@nestjs/common';
import {
  ACCENT_SENSITIVE_BAD_WORDS,
  BAD_WORDS,
  INAPPROPRIATE_REVIEW_TEXT,
} from './bad-words';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildBoundaryPattern = (value: string, allowSeparatedLetters = false) => {
  const words = value.split(' ');
  const pattern =
    allowSeparatedLetters && words.length === 1 && value.length <= 4
      ? value.split('').map(escapeRegExp).join('\\s*')
      : words.map(escapeRegExp).join('\\s+');

  return new RegExp(`(?:^|\\s)${pattern}(?=\\s|$)`, 'u');
};

@Injectable()
export class ReviewModerationService {
  normalizeText(text = ''): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/0/g, 'o')
      .replace(/3/g, 'e')
      .replace(/[1!]/g, 'i')
      .replace(/@/g, 'a')
      .replace(/7/g, 't')
      .replace(/[*_]+/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeWithAccents(text = ''): string {
    return text
      .toLowerCase()
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

    const normalizedMatches = BAD_WORDS.filter((badWord) =>
      buildBoundaryPattern(badWord, true).test(normalizedText),
    );

    const accentSensitiveText = this.normalizeWithAccents(text);
    const accentSensitiveMatches = ACCENT_SENSITIVE_BAD_WORDS.filter(
      (badWord) =>
        buildBoundaryPattern(this.normalizeWithAccents(badWord)).test(
          accentSensitiveText,
        ),
    );

    const matchedWords = [
      ...new Set<string>([
        ...normalizedMatches,
        ...accentSensitiveMatches,
      ]),
    ];

    return {
      isViolating: matchedWords.length > 0,
      censoredText:
        matchedWords.length > 0 ? INAPPROPRIATE_REVIEW_TEXT : text.trim(),
      matchedWords,
    };
  }
}
