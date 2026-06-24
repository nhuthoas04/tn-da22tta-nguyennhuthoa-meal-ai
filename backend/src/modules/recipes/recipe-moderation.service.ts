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
        'Cac buoc che bien qua ngan. Hay bo sung it nhat 2 buoc ro rang.',
      );
      qualityScore -= 20;
    }

    if (ingredientNames.length < 2) {
      missingIngredients.push(
        'Danh sach nguyen lieu qua ngan. Hay bo sung it nhat 2 nguyen lieu.',
      );
      qualityScore -= 20;
    }

    let rawFeedback = 'Kiem tra tinh hoan thanh.';
    let nutritionValidityNotes =
      'Calo va dinh duong se duoc admin xem xet them neu can.';
    let aiEvaluationFailed = false;

    if (this.genAI) {
      try {
        const model = this.genAI.getGenerativeModel({ model: this.modelName });
        const prompt = `
Ban la tro ly kiem duyet cong thuc.
Hay phan tich cong thuc sau va tra ve JSON thuan:
{
  "caloriesReasonable": true,
  "nutritionValidityNotes": "...",
  "qualityScore": 0,
  "missingIngredients": [],
  "missingSteps": [],
  "feedback": "..."
}

Ten mon: ${recipe.name}
Mo ta: ${recipe.description || 'Khong co'}
Nguyen lieu: ${
          recipe.recipeIngredients
            ?.map((ri) => `${ri.quantity} ${ri.unit} ${ri.ingredient?.name}`)
            .join(', ') || 'Khong co'
        }
Calories: ${recipe.calories} kcal/phan
Protein: ${recipe.protein}g, Carbs: ${recipe.carbs}g, Fat: ${recipe.fat}g
Steps:
${normalizedSteps.map((step) => `Buoc ${step.step}: ${step.description}`).join('\n') || 'Khong co'}
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
          'AI chưa đánh giá được, admin có thể duyệt thủ công.';
        rawFeedback = this.isTransientGeminiError(err?.message)
          ? 'Gemini đang bận hoặc tạm thời quá tải. Bạn có thể thử lại AI Review sau.'
          : 'AI chưa đánh giá được công thức lúc này. Admin vẫn có thể duyệt thủ công.';
      }
    } else {
      aiEvaluationFailed = true;
      nutritionValidityNotes =
        'AI chưa đánh giá được, admin có thể duyệt thủ công.';
      rawFeedback =
        'AI moderation chua duoc cau hinh hoac tam thoi khong kha dung.';
    }

    audit.missingIngredients = Array.from(new Set(missingIngredients));
    audit.missingSteps = Array.from(new Set(missingSteps));

    if (audit.isDuplicateDetected) {
      qualityScore = Math.max(10, qualityScore - 30);
      rawFeedback = `Canh bao trung lap voi cong thuc "${possibleDuplicate?.name}". ${rawFeedback}`;
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
