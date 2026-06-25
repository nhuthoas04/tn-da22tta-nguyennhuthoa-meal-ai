import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Recipe } from './entities/recipe.entity';
import { RecipeModerationAudit } from './entities/recipe-moderation-audit.entity';
import { normalizeRecipeSteps } from './recipe-normalization.util';

@Injectable()
export class RecipeModerationService implements OnModuleInit {
  private readonly logger = new Logger(RecipeModerationService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private modelName = 'gemini-2.5-flash';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(RecipeModerationAudit)
    private readonly auditRepo: Repository<RecipeModerationAudit>,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const isPlaceholder =
      !apiKey ||
      apiKey.trim() === '' ||
      apiKey.includes('YOUR_') ||
      apiKey.includes('your_');

    if (isPlaceholder) {
      this.logger.warn(
        'GEMINI_API_KEY is missing or placeholder. Moderation will use fallback mode.',
      );
      this.genAI = null;
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } catch (err: any) {
      this.logger.error(
        'Failed to initialize Gemini AI for moderation:',
        err.message,
      );
      this.genAI = null;
    }
  }

  async auditRecipe(recipeId: string): Promise<RecipeModerationAudit> {
    this.logger.log(`AI auditing recipe ID: ${recipeId}`);

    const recipe = await this.recipeRepo.findOne({
      where: { id: recipeId },
      relations: ['recipeIngredients', 'recipeIngredients.ingredient'],
    });

    if (!recipe) {
      throw new Error(`Recipe with ID ${recipeId} not found`);
    }

    let audit = await this.auditRepo.findOne({ where: { recipeId } });
    if (!audit) {
      audit = new RecipeModerationAudit();
      audit.recipeId = recipeId;
    }

    const normalizedSteps = normalizeRecipeSteps(recipe.steps);

    const possibleDuplicate = await this.recipeRepo.findOne({
      where: {
        name: ILike(`%${recipe.name}%`),
        isActive: true,
        status: 'approved',
      },
    });

    if (possibleDuplicate && possibleDuplicate.id !== recipe.id) {
      audit.isDuplicateDetected = true;
      audit.duplicateOfRecipeId = possibleDuplicate.id;
    } else {
      audit.isDuplicateDetected = false;
      audit.duplicateOfRecipeId = null;
    }

    const missingIngredients: string[] = [];
    const missingSteps: string[] = [];
    let qualityScore = 100;

    const ingredientNames =
      recipe.recipeIngredients?.map(
        (ri) => ri.ingredient?.name?.toLowerCase() || '',
      ) || [];
    const stepsText =
      normalizedSteps.map((step) => step.description.toLowerCase()).join(' ') ||
      '';

    const stepWords = stepsText.split(/[\s,.\-()]+/).filter(Boolean);
    const keywordsToCheck = [
      'toi',
      'hanh',
      'tieu',
      'ot',
      'muoi',
      'duong',
      'mam',
      'dau',
      'bo',
      'sua',
      'trung',
      'thit',
      'ca',
      'tom',
      'ga',
    ];

    for (const keyword of keywordsToCheck) {
      if (
        stepWords.includes(keyword) &&
        !ingredientNames.some((ingredient) => ingredient.includes(keyword))
      ) {
        missingIngredients.push(
          `Thieu nguyen lieu co tu khoa "${keyword}" duoc nhac trong cac buoc che bien.`,
        );
      }
    }

    if (normalizedSteps.length < 2) {
      missingSteps.push(
        'Các bước chế biến quá ngắn. Hãy bổ sung ít nhất 2 bước rõ ràng.',
      );
      qualityScore -= 20;
    } else {
      const hasTooShortStep = normalizedSteps.some(
        (step) => step.description.trim().length <= 2,
      );
      if (hasTooShortStep) {
        missingSteps.push('Bước thực hiện chưa đủ rõ để người dùng làm theo.');
        qualityScore -= 30;
      }
    }

    if (ingredientNames.length < 2) {
      missingIngredients.push('Cần bổ sung nguyên liệu và định lượng.');
      qualityScore -= 20;
    }

    let nutritionValidityNotes = 'Calo và dinh dưỡng sẽ được admin xem xét thêm nếu cần.';
    if (recipe.calories === 0) {
      nutritionValidityNotes = 'Công thức thiếu thông tin dinh dưỡng.';
      qualityScore -= 10;
    }

    let rawFeedback = 'Kiểm tra tính hoàn thành.';
    let aiEvaluationFailed = false;

    if (this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: this.modelName });
        const prompt = `
Bạn là trợ lý duyệt công thức nấu ăn của hệ thống AI Meal Planner.
Hãy phân tích công thức sau cực kỳ kỹ lưỡng và khách quan, sau đó trả về một đối tượng JSON thuần túy (không kèm markdown hay text giải thích ngoài JSON) theo đúng định dạng sau:
{
  "caloriesReasonable": boolean,
  "nutritionValidityNotes": "Nhận xét chi tiết về calo và dinh dưỡng bằng tiếng Việt. Nếu Calories = 0, bắt buộc ghi rõ 'Công thức thiếu thông tin dinh dưỡng.'",
  "qualityScore": number (từ 0 đến 100),
  "missingIngredients": string[] (Danh sách các cảnh báo nguyên liệu bằng tiếng Việt. Ví dụ: 'Cần bổ sung nguyên liệu và định lượng.' nếu thiếu nguyên liệu hoặc định lượng không rõ ràng),
  "missingSteps": string[] (Danh sách cảnh báo các bước bằng tiếng Việt. Ví dụ: 'Bước thực hiện chưa đủ rõ để người dùng làm theo.' nếu các bước quá ngắn, ví dụ chỉ ghi 'à', hoặc không rõ ràng),
  "feedback": "Nhận xét/đánh giá chung bằng tiếng Việt. Nếu nội dung công thức quá sơ sài hoặc thiếu thông tin quan trọng, bắt buộc ghi 'Không nên duyệt ngay nếu nội dung chưa đầy đủ.'"
}

Thông tin công thức:
Tên món: ${recipe.name}
Mô tả: ${recipe.description || 'Không có'}
Nguyên liệu: ${
          recipe.recipeIngredients
            ?.map((ri) => `${ri.quantity} ${ri.unit} ${ri.ingredient?.name}`)
            .join(', ') || 'Không có'
        }
Calories: ${recipe.calories} kcal/phần
Protein: ${recipe.protein}g, Carbs: ${recipe.carbs}g, Fat: ${recipe.fat}g
Các bước thực hiện:
${normalizedSteps.map((step) => `Bước ${step.step}: ${step.description}`).join('\n') || 'Không có'}
        `;

        const response = await model.generateContent(prompt);
        const text = response.response.text();
        const cleanedText = text
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();
        const aiResult = JSON.parse(cleanedText);

        if (aiResult?.missingIngredients?.length) {
          missingIngredients.push(...aiResult.missingIngredients);
        }
        if (aiResult?.missingSteps?.length) {
          missingSteps.push(...aiResult.missingSteps);
        }

        qualityScore = Number(aiResult?.qualityScore || qualityScore);
        nutritionValidityNotes =
          aiResult?.nutritionValidityNotes || nutritionValidityNotes;
        rawFeedback = aiResult?.feedback || rawFeedback;
      } catch (err: any) {
        this.logger.error(
          'Gemini moderation failed, using fallback rules:',
          err.message,
        );
        aiEvaluationFailed = true;
        nutritionValidityNotes =
          recipe.calories === 0
            ? 'Công thức thiếu thông tin dinh dưỡng.'
            : 'AI chưa đánh giá được, admin có thể duyệt thủ công.';
        rawFeedback = this.isTransientGeminiError(err?.message)
          ? 'Gemini đang bận hoặc tạm thời quá tải. Bạn có thể thử lại AI Review sau.'
          : 'AI chưa đánh giá được công thức lúc này. Admin vẫn có thể duyệt thủ công.';
      }
    } else {
      aiEvaluationFailed = true;
      nutritionValidityNotes =
        recipe.calories === 0
          ? 'Công thức thiếu thông tin dinh dưỡng.'
          : 'AI chưa đánh giá được, admin có thể duyệt thủ công.';
      rawFeedback =
        'AI moderation chưa được cấu hình hoặc tạm thời không khả dụng.';
    }

    audit.missingIngredients = Array.from(new Set(missingIngredients));
    audit.missingSteps = Array.from(new Set(missingSteps));

    if (audit.isDuplicateDetected) {
      qualityScore = Math.max(10, qualityScore - 30);
      rawFeedback = `Cảnh báo trùng lặp với công thức "${possibleDuplicate?.name}". ${rawFeedback}`;
    }

    if (aiEvaluationFailed) {
      audit.qualityScore = -1;
      audit.isApprovedByAI = false;
      audit.aiEvaluationFailed = true;
      audit.nutritionValidityNotes = nutritionValidityNotes;
      audit.rawAIFeedback = rawFeedback;
    } else {
      audit.qualityScore = Math.max(0, Math.min(100, qualityScore));
      audit.isApprovedByAI =
        audit.qualityScore >= 70 &&
        audit.missingIngredients.length === 0 &&
        !audit.isDuplicateDetected;
      audit.aiEvaluationFailed = false;
      audit.nutritionValidityNotes = nutritionValidityNotes;
      audit.rawAIFeedback = rawFeedback;
    }

    return await this.auditRepo.save(audit);
  }

  async getAuditByRecipeId(
    recipeId: string,
  ): Promise<RecipeModerationAudit | null> {
    return await this.auditRepo.findOne({ where: { recipeId } });
  }

  private isTransientGeminiError(message?: string): boolean {
    const text = String(message || '').toLowerCase();
    return (
      text.includes('503') ||
      text.includes('timeout') ||
      text.includes('quota') ||
      text.includes('overloaded') ||
      text.includes('high demand') ||
      text.includes('unavailable')
    );
  }
}
