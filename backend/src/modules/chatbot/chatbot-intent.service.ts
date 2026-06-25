import { Injectable } from '@nestjs/common';
import {
  ChatbotConversationContext,
  ChatbotEntities,
  ChatbotIntent,
  IntentDetectionResult,
} from './chatbot.types';

@Injectable()
export class ChatbotIntentService {
  detect(
    message: string,
    context?: ChatbotConversationContext,
  ): IntentDetectionResult {
    const original = message.trim();
    const text = this.normalize(original);
    const entities = this.extractEntities(original, text, context);

    const matched = (intent: ChatbotIntent, confidence = 0.94) => ({
      intent,
      confidence,
      entities,
    });

    if (/^(xin chao|chao|hello|hi|hey)(\s|$)/.test(text)) {
      return matched('GREETING', 0.99);
    }
    if (
      this.hasAny(text, [
        'ban lam duoc gi',
        'huong dan dung chatbot',
        'co nhung lenh nao',
        'toi co the yeu cau gi',
        'tro giup',
      ])
    ) {
      return matched('HELP_COMMANDS', 0.99);
    }
    if (
      this.hasAny(text, ['mo trang', 'chuyen sang trang', 'cho toi xem trang', 'vao trang']) ||
      /^(mo|vao)\s+(tu lanh|thuc don|cong thuc|trang)/.test(text)
    ) {
      return matched('NAVIGATE_PAGE', 0.99);
    }
    if (
      this.isAddInventoryRequest(text) &&
      (entities.quantity || this.hasAny(text, ['tu lanh', 'kho', 'nguyen lieu']))
    ) {
      return matched('ADD_INVENTORY_ITEM', 0.98);
    }
    if (
      this.hasAny(text, [
        'tao danh sach mua sam',
        'tao danh sach di cho',
        'toi can mua gi',
        'lap danh sach mua sam',
        'lap danh sach di cho',
      ])
    ) {
      return matched('GENERATE_SHOPPING_LIST', 0.99);
    }
    if (
      this.hasAny(text, [
        'tao thuc don',
        'len thuc don',
        'lap thuc don',
        'tao lai thuc don',
      ])
    ) {
      return matched('CREATE_MEAL_PLAN', 0.99);
    }
    if (
      /^(them|cho)\b/.test(text) &&
      this.hasAny(text, ['thuc don', 'bua sang', 'bua trua', 'bua toi', 'mon nay', 'mon vua goi y'])
    ) {
      return matched('ADD_RECIPE_TO_MEAL_PLAN', 0.98);
    }
    if (
      this.hasAny(text, [
        'doi mon',
        'thay mon',
        'thay the mon',
        'goi y mon khac cho bua',
        'toi khong thich mon nay',
      ]) ||
      /^(doi|thay)\s+.+\s+thanh\s+.+/.test(text)
    ) {
      return matched('REPLACE_MEAL_ITEM', 0.98);
    }
    if (
      (/^(xoa|bo)\b/.test(text) &&
        this.hasAny(text, ['mon', 'bua', 'thuc don', 'ngay mai', 'hom nay', 'hom qua'])) ||
      /^(don|clear)\s+(bua|buoi)\b/.test(text)
    ) {
      return matched('REMOVE_MEAL_ITEM', 0.98);
    }
    if (
      this.hasAny(text, ['phan tich thuc don', 'dinh duong tuan nay', 'ai insights'])
    ) {
      return matched('ANALYZE_MEAL_PLAN', 0.98);
    }
    if (
      this.hasAny(text, [
        'bao nhieu calo',
        'du protein',
        'kiem tra dinh duong',
        'nhieu chat beo',
        'qua calo',
        'dinh duong',
      ])
    ) {
      return matched('CHECK_NUTRITION', 0.96);
    }
    if (
      this.hasAny(text, [
        'trong tu lanh',
        'kiem tra tu lanh',
        'con bao nhieu',
        'con gi',
        'sap het han',
        'nen dung truoc',
        'gan het',
      ])
    ) {
      return matched('CHECK_INVENTORY', 0.97);
    }
    if (this.hasAny(text, ['cong thuc yeu thich', 'mon yeu thich', 'danh sach yeu thich'])) {
      return matched('SHOW_FAVORITES', 0.98);
    }
    if (/^(tim|tim kiem)\b/.test(text) || this.hasAny(text, ['co mon nao nau duoi'])) {
      return matched('SEARCH_RECIPE', 0.97);
    }
    if (
      this.hasAny(text, ['toi co ', 'tu nguyen lieu', 'theo nguyen lieu']) &&
      this.hasAny(text, ['nau mon gi', 'lam mon gi', 'goi y mon'])
    ) {
      return matched('SUGGEST_BY_INGREDIENTS', 0.98);
    }
    if (
      this.hasAny(text, [
        'hom nay nen an gi',
        'goi y mon',
        'goi y do an',
        'nen an gi',
        'nau gi',
      ])
    ) {
      return matched(
        entities.ingredients?.length ? 'SUGGEST_BY_INGREDIENTS' : 'SUGGEST_RECIPE',
        0.96,
      );
    }

    return matched('UNKNOWN', 0.2);
  }

  isAffirmative(message: string): boolean {
    const text = this.normalize(message).replace(/[.!?]/g, '').trim();
    return ['co', 'dong y', 'ok', 'okay', 'lam di', 'xac nhan', 'dung roi'].includes(text);
  }

  isNegative(message: string): boolean {
    const text = this.normalize(message).replace(/[.!?]/g, '').trim();
    return ['khong', 'huy', 'thoi', 'de sau', 'khong can'].includes(text);
  }

  extractEntities(
    original: string,
    normalized?: string,
    context?: ChatbotConversationContext,
  ): ChatbotEntities {
    const text = normalized || this.normalize(original);
    const entities: ChatbotEntities = {};

    entities.mealType = this.parseMealType(original, text);
    entities.date = this.parseDate(text);
    entities.period = text.includes('tuan nay') || text.includes('thu hai den chu nhat')
      ? 'week'
      : 'day';

    const servings = text.match(/(?:cho\s+)?(\d{1,2})\s*nguoi/);
    if (servings) entities.servings = Number(servings[1]);

    const time = text.match(/(?:duoi|trong)\s+(\d{1,3})\s*phut/);
    if (time) entities.maxCookingTime = Number(time[1]);
    if (this.hasAny(text, ['it calo', 'giam can'])) entities.maxCalories = 500;
    if (this.hasAny(text, ['nhieu protein', 'tang co', 'du protein'])) entities.minProtein = 25;
    if (this.hasAny(text, ['de nau', 'don gian'])) entities.difficulty = 'easy';
    if (this.hasAny(text, ['dua tren tu lanh', 'phu hop voi tu lanh', 'tu lanh cua toi'])) {
      entities.useInventory = true;
    }

    entities.excludedIngredients = this.extractExcludedIngredients(original);
    entities.ingredients = this.extractIngredients(original, text);
    entities.route = this.parseRoute(text);

    const amount = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gram|lit|l|ml|qua|cu|hop|goi|chai|bo|lon|cai|muong)/);
    if (amount) {
      const quantity = Number(amount[1].replace(',', '.'));
      let unit = amount[2];
      if (unit === 'lit') unit = 'l';
      entities.quantity = quantity;
      entities.unit = unit;
      entities.inventoryQuery = this.extractInventoryItemName(text);
    }

    if (!entities.inventoryQuery && this.isAddInventoryRequest(text)) {
      entities.inventoryQuery = this.extractInventoryItemName(text);
    }

    const expiryDate = this.parseExpirationDate(text);
    const expiry = text.match(/han (?:dung|su dung)?\s*(\d{1,3})\s*ngay/);
    if (expiryDate) {
      entities.expirationDate = expiryDate;
    } else if (expiry) {
      entities.expirationDate = this.formatDate(this.addDays(new Date(), Number(expiry[1])));
    }

    const clearMealItems = this.isClearMealItemsRequest(text);
    if (clearMealItems) {
      entities.clearMealItems = true;
    }

    const replaceMatch = original.match(/(?:đổi|thay)\s+(?:món\s+)?(.+?)\s+thành\s+(.+?)(?:\s+(?:trong|vào|ở)\s+bữa|$)/iu);
    if (replaceMatch) {
      entities.oldRecipeName = this.cleanRecipeName(replaceMatch[1]);
      entities.recipeName = this.cleanRecipeName(replaceMatch[2]);
    } else if (/^(thêm|cho)\b/iu.test(original)) {
      const addMatch = original.match(/^(?:thêm|cho)\s+(?:món\s+)?(.+?)(?:\s+(?:vào|cho)\s+bữa|\s+vào\s+thực đơn|$)/iu);
      if (addMatch && !/^(này|vừa gợi ý)$/iu.test(addMatch[1].trim())) {
        entities.recipeName = this.cleanRecipeName(addMatch[1]);
      }
    } else if (/^(xóa|bỏ)\b/iu.test(original) && !clearMealItems) {
      const removeMatch = original.match(/^(?:xóa|bỏ)\s+(?:món\s+)?(.+?)(?:\s+khỏi|\s+trong|$)/iu);
      if (removeMatch && !/^(này|toàn bộ|cả)$/iu.test(removeMatch[1].trim())) {
        entities.recipeName = this.cleanRecipeName(removeMatch[1]);
      }
    }

    if (/^(tìm|tìm kiếm)\b/iu.test(original)) {
      const query = original
        .replace(/^(?:tìm|tìm kiếm)\s+(?:món|công thức)?\s*(?:có\s+)?/iu, '')
        .replace(/\s+(?:ít calo|dễ nấu|ăn sáng)$/iu, '')
        .trim();
      if (query && !/^(ít calo|dễ nấu|ăn sáng)$/iu.test(query)) entities.recipeName = query;
    }

    const removeCountMatch = text.match(/^(?:xoa|bo)\s+(\d+)\s+mon\b/);
    if (removeCountMatch) {
      entities.removeCount = Number(removeCountMatch[1]);
      delete entities.recipeName;
    }

    if (clearMealItems) {
      delete entities.recipeId;
      delete entities.recipeName;
      entities.scope = 'meal';
    } else if (entities.removeCount) entities.scope = 'meal';
    else if (this.hasAny(text, ['toan bo bua', 'ca bua'])) entities.scope = 'meal';
    else if (this.hasAny(text, ['lam trong thuc don ngay', 'toan bo thuc don', 'xoa ngay'])) entities.scope = 'day';
    else entities.scope = 'item';

    if (this.hasAny(text, ['tao lai', 'ghi de', 'thay toan bo'])) entities.overwrite = true;

    if (!entities.recipeName && this.hasAny(text, ['mon nay', 'mon do', 'mon vua goi y'])) {
      entities.recipeId = context?.lastSelectedRecipe?.id || context?.lastSuggestedRecipes?.[0]?.id;
      entities.recipeName = context?.lastSelectedRecipe?.name || context?.lastSuggestedRecipes?.[0]?.name;
    }

    return this.compact(entities);
  }

  private extractIngredients(original: string, normalized: string): string[] | undefined {
    const match = original.match(/(?:tôi có|mình có|từ|theo nguyên liệu)\s+(.+?)(?:\s+thì|\s+(?:nấu|làm|gợi ý)|[?.!]|$)/iu);
    if (!match) return undefined;
    const values = match[1]
      .split(/,|\bvà\b|\bvoi\b/iu)
      .map((value) => value.replace(/^có\s+/iu, '').trim())
      .filter((value) => value.length > 1 && !/tủ lạnh/iu.test(value));
    return values.length ? values : undefined;
  }

  private extractExcludedIngredients(original: string): string[] | undefined {
    const matches = [
      ...original.matchAll(/(?:không có|không chứa|dị ứng|tránh)\s+([\p{L}\s]+?)(?=,|\.|$|\s+và\s+gợi)/giu),
    ];
    const values = matches
      .map((match) => match[1].trim())
      .filter((value) => value.length > 1);
    return values.length ? values : undefined;
  }

  private extractInventoryItemName(text: string): string | undefined {
    const unitPattern = '(?:kg|g|gram|lit|l|ml|qua|cu|hop|goi|chai|bo|lon|cai|muong)';
    const stopPattern = '(?:\\s+han\\b.+)?(?:\\s+vao\\s+(?:tu\\s+lanh|kho)|$)';
    const beforeAmount = new RegExp(
      `^(?:them|cho|bo)\\s+(?:nguyen\\s+lieu\\s+)?(.+?)\\s+\\d+(?:[.,]\\d+)?\\s*${unitPattern}${stopPattern}`,
    );
    const afterAmount = new RegExp(
      `^(?:them|cho|bo)?\\s*\\d+(?:[.,]\\d+)?\\s*${unitPattern}\\s+(.+?)${stopPattern}`,
    );
    const fridgeHas = new RegExp(
      `^tu\\s+lanh\\s+co\\s+\\d+(?:[.,]\\d+)?\\s*${unitPattern}\\s+(.+?)(?:\\s+han\\b.+)?$`,
    );
    const noAmount = /^(?:them|cho|bo)\s+(?:nguyen\s+lieu\s+)?(.+?)(?:\s+vao\s+(?:tu\s+lanh|kho)|$)/;
    const match = beforeAmount.exec(text) || afterAmount.exec(text) || fridgeHas.exec(text) || noAmount.exec(text);
    return match ? this.cleanInventoryName(match[1]) : undefined;
  }

  private cleanInventoryName(value: string): string | undefined {
    const cleaned = value
      .replace(/\bhan\b.+$/u, '')
      .replace(/\bvao\s+(?:tu\s+lanh|kho).*$/u, '')
      .replace(/^nguyen\s+lieu\s+/u, '')
      .trim();
    return cleaned || undefined;
  }

  private isAddInventoryRequest(text: string): boolean {
    return (
      /^(?:them|cho|bo)\b/.test(text) &&
        this.hasAny(text, ['tu lanh', 'vao kho', 'nguyen lieu'])
    ) || text.includes('tu lanh co');
  }

  private parseExpirationDate(text: string): string | undefined {
    const match = text.match(/han(?: dung| su dung)?\s+(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?/);
    if (!match) return undefined;
    const year = match[3] || String(new Date().getFullYear());
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  private parseMealType(original: string, text: string): ChatbotEntities['mealType'] {
    const originalLower = original.toLowerCase();
    const hasVietnameseDinnerWord = /\btối\b/iu.test(originalLower);
    const hasPlainDinnerWord =
      /\b(?:bua|buoi|an|mon|o|vao|cho)\s+toi\b/.test(text) ||
      /\btoi\s+(?:hom|ngay|thu|nay|mai|qua)\b/.test(text) ||
      text.includes('chieu toi');

    if (
      text.includes('bua sang') ||
      text.includes('buoi sang') ||
      text.includes('an sang') ||
      text.includes('mon sang') ||
      /\bsang\b/.test(text)
    ) return 'breakfast';
    if (
      text.includes('bua trua') ||
      text.includes('buoi trua') ||
      text.includes('an trua') ||
      text.includes('mon trua') ||
      /\btrua\b/.test(text)
    ) return 'lunch';
    if (
      text.includes('bua toi') ||
      text.includes('buoi toi') ||
      text.includes('an toi') ||
      text.includes('mon toi') ||
      text.includes('chieu toi') ||
      hasVietnameseDinnerWord ||
      hasPlainDinnerWord
    ) return 'dinner';
    if (text.includes('bua phu')) return 'snack';
    return undefined;
  }

  private isClearMealItemsRequest(text: string): boolean {
    return (
      /^(?:xoa|bo)\s+(?:cac|het|toan bo|tat ca)\s+mon\b/.test(text) ||
      /^(?:xoa|bo)\s+(?:het|toan bo|tat ca|ca)\s+bua\b/.test(text) ||
      /\b(?:xoa|bo)\s+(?:cac|het|toan bo|tat ca)\s+mon\s+(?:o|trong|khoi)?\s*(?:bua|buoi)\b/.test(text) ||
      /\b(?:don|clear)\s+(?:bua|buoi)\b/.test(text) ||
      /\bbo\s+het\s+mon\b/.test(text)
    );
  }

  private parseDate(text: string): string | undefined {
    const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const dmy = text.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](20\d{2}))?\b/);
    if (dmy) {
      return `${dmy[3] || new Date().getFullYear()}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    const today = new Date();
    if (text.includes('ngay kia')) return this.formatDate(this.addDays(today, 2));
    if (text.includes('ngay mai')) return this.formatDate(this.addDays(today, 1));
    if (text.includes('hom qua') || text.includes('toi qua')) return this.formatDate(this.addDays(today, -1));
    if (text.includes('hom nay') || text.includes('toi nay') || text.includes('trua nay')) {
      return this.formatDate(today);
    }
    const weekdays: Array<[string, number]> = [
      ['chu nhat', 0],
      ['thu hai', 1],
      ['thu ba', 2],
      ['thu tu', 3],
      ['thu nam', 4],
      ['thu sau', 5],
      ['thu bay', 6],
    ];
    for (const [label, day] of weekdays) {
      if (!text.includes(label)) continue;
      let diff = (day - today.getDay() + 7) % 7;
      if (text.includes('tuan sau')) diff += 7;
      return this.formatDate(this.addDays(today, diff));
    }
    return undefined;
  }

  private parseRoute(text: string): string | undefined {
    const routes: Array<[string[], string]> = [
      [['thuc don', 'meal planner'], '/meal-planner'],
      [['mua sam', 'di cho'], '/shopping-list'],
      [['tu lanh', 'kho nguyen lieu'], '/inventory'],
      [['dinh duong', 'ai insights'], '/nutrition'],
      [['ca nhan', 'ho so'], '/profile'],
      [['yeu thich'], '/favorites'],
      [['quan tri', 'admin'], '/admin'],
      [['cong thuc', 'mon an'], '/recipes'],
      [['trang chu'], '/'],
    ];
    return routes.find(([aliases]) => aliases.some((alias) => text.includes(alias)))?.[1];
  }

  private cleanRecipeName(value: string): string {
    return value.replace(/^(món|cái)\s+/iu, '').replace(/[?.!,]+$/g, '').trim();
  }

  private compact(entities: ChatbotEntities): ChatbotEntities {
    return Object.fromEntries(
      Object.entries(entities).filter(([, value]) => value !== undefined && value !== ''),
    );
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hasAny(text: string, values: string[]): boolean {
    return values.some((value) => text.includes(value));
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
