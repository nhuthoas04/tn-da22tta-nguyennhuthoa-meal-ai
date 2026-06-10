import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const BAD_WORDS = [
  'dit', 'du', 'cac', 'lon', 'ngu', 'cho', 'suc vat', 'djt', 'vcl', 'vl', 'cl', 'dcm', 'dm', 'đm', 'đmm',
  'fuck', 'shit', 'bitch', 'ass', 'bastard', 'idiot', 'retard'
];

@Injectable()
export class ReviewModerationService implements OnModuleInit {
  private readonly logger = new Logger(ReviewModerationService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private modelName = 'gemini-2.5-flash';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const isPlaceholder = !apiKey || apiKey.trim() === '' || apiKey.includes('YOUR_') || apiKey.includes('your_');
    if (isPlaceholder) {
      this.logger.warn('GEMINI_API_KEY is not defined or is a placeholder. Review AI Moderation will run in fallback/static mode.');
      this.genAI = null;
    } else {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
      } catch (err: any) {
        this.logger.error('Failed to initialize Gemini AI for Review Moderation:', err.message);
        this.genAI = null;
      }
    }
  }

  private removeAccentChar(char: string): string {
    const accents = 'àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
    const noAccents = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';
    const index = accents.indexOf(char);
    return index !== -1 ? noAccents[index] : char;
  }

  normalizeText(text: string): string {
    let normalized = '';
    for (let i = 0; i < text.length; i++) {
      let char = text[i].toLowerCase();
      char = this.removeAccentChar(char);
      // Leet substitution mapping
      if (char === '!') char = 'i';
      else if (char === '@') char = 'a';
      else if (char === '0') char = 'o';
      else if (char === '3') char = 'e';
      else if (char === '1') char = 'i';
      else if (char === '7') char = 't';
      else if (char === '*' || char === '_' || char === '-' || char === '.') char = ' '; // Maintain length
      normalized += char;
    }
    return normalized;
  }

  filterBadWords(text: string): { isViolating: boolean; censoredText: string; matchedWords: string[] } {
    const normalized = this.normalizeText(text);
    const matchedWords = new Set<string>();
    let isViolating = false;
    const originalChars = text.split('');

    for (const badWord of BAD_WORDS) {
      const regex = new RegExp(`\\b${badWord}\\b`, 'g');
      let match;
      while ((match = regex.exec(normalized)) !== null) {
        isViolating = true;
        matchedWords.add(badWord);
        
        const start = match.index;
        const end = start + badWord.length;
        
        for (let i = start; i < end; i++) {
          if (originalChars[i] && originalChars[i] !== ' ') {
            originalChars[i] = '*';
          }
        }
      }
    }

    return {
      isViolating,
      censoredText: originalChars.join(''),
      matchedWords: Array.from(matchedWords),
    };
  }

  async auditReviewWithAI(text: string): Promise<{ isFlagged: boolean; reason: string }> {
    if (!this.genAI) {
      return { isFlagged: false, reason: '' };
    }
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const prompt = `
        Bạn là trợ lý kiểm duyệt nội dung chuyên nghiệp cho website ẩm thực MealAI.
        Hãy phân tích bình luận sau của người dùng và trả về kết quả dưới định dạng JSON duy nhất.
        
        Bình luận: "${text}"
        
        Yêu cầu đánh giá theo 4 khía cạnh:
        - toxic (ngôn từ gây hại, lăng mạ, thiếu văn hóa)
        - harassment (quấy rối, công kích cá nhân)
        - hateSpeech (ngôn từ thù ghét)
        - spam (nội dung rác, quảng cáo, không liên quan đến món ăn)
        
        Định dạng JSON trả về phải tuân thủ chính xác cấu trúc sau:
        {
          "isFlagged": true/false,
          "reason": "Lý do chi tiết ngắn gọn bằng tiếng Việt nếu bị gắn cờ, ngược lại để rỗng",
          "categories": {
            "toxic": true/false,
            "harassment": true/false,
            "hateSpeech": true/false,
            "spam": true/false
          }
        }
        Không bao gồm bất kỳ giải thích nào khác ngoài chuỗi JSON sạch.
      `;
      
      const response = await model.generateContent(prompt);
      const responseText = response.response.text();
      const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanedText);
      return {
        isFlagged: !!result.isFlagged,
        reason: result.reason || '',
      };
    } catch (err: any) {
      this.logger.error('Gemini AI review moderation failed:', err.message);
      return { isFlagged: false, reason: '' };
    }
  }
}
