import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, FunctionDeclaration } from '@google/generative-ai';
import { ChatMessage } from './entities/chat-message.entity';
import { UserActionLog } from './entities/user-action-log.entity';
import { VoiceCommandLog } from './entities/voice-command-log.entity';
import { ChatbotActionHandler } from './chatbot-action.handler';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ChatbotAIService implements OnModuleInit {
  private readonly logger = new Logger(ChatbotAIService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private modelName = 'gemini-2.5-flash';

  constructor(
    private readonly configService: ConfigService,
    private readonly actionHandler: ChatbotActionHandler,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepo: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserActionLog)
    private readonly actionLogRepo: Repository<UserActionLog>,
    @InjectRepository(VoiceCommandLog)
    private readonly voiceLogRepo: Repository<VoiceCommandLog>,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const isPlaceholder = !apiKey || apiKey.trim() === '' || apiKey.includes('YOUR_') || apiKey.includes('your_');
    if (isPlaceholder) {
      this.logger.warn('GEMINI_API_KEY is not defined or is a placeholder in environment variables. Chatbot will run in fallback/mock mode.');
      this.genAI = null;
      return;
    }
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.logger.log('Google Generative AI successfully initialized.');
    } catch (err: any) {
      this.logger.error('Failed to initialize Google Generative AI:', err.message);
      this.genAI = null;
    }
  }

  // Define Function Declarations for Gemini Function Calling
  private getFunctions(): FunctionDeclaration[] {
    return [
      {
        name: 'search_recipes',
        description: 'Tìm kiếm công thức nấu ăn trong cơ sở dữ liệu với các bộ lọc như tên, loại bữa ăn, thời gian nấu, lượng calo, vùng miền.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            search: { type: 'STRING' as any, description: 'Từ khóa tìm kiếm tên công thức món ăn (ví dụ: phở, gà, cá...)' },
            mealType: { type: 'STRING' as any, description: 'Loại bữa ăn: breakfast (bữa sáng), lunch (bữa trưa), dinner (bữa tối)' },
            maxCookingTime: { type: 'NUMBER' as any, description: 'Thời gian nấu tối đa bằng phút' },
            minCalories: { type: 'NUMBER' as any, description: 'Lượng calo tối thiểu' },
            maxCalories: { type: 'NUMBER' as any, description: 'Lượng calo tối đa' },
            region: { type: 'STRING' as any, description: 'Vùng miền ẩm thực (ví dụ: miền Bắc, miền Trung, miền Nam)' },
            limit: { type: 'NUMBER' as any, description: 'Số lượng công thức muốn lấy (mặc định 5)' },
          },
        },
      },
      {
        name: 'get_recipe_detail',
        description: 'Xem chi tiết một công thức cụ thể bao gồm mô tả, nguyên liệu chi tiết, các bước thực hiện và dinh dưỡng.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            recipeId: { type: 'STRING' as any, description: 'ID duy nhất của công thức món ăn' },
          },
          required: ['recipeId'],
        },
      },
      {
        name: 'get_recommendations',
        description: 'Gợi ý món ăn cá nhân hóa từ AI dựa trên sở thích, dị ứng, mục tiêu dinh dưỡng hoặc sử dụng nguyên liệu thông minh (chống lãng phí).',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            mealType: { type: 'STRING' as any, description: 'Loại bữa ăn: breakfast, lunch, dinner' },
            limit: { type: 'NUMBER' as any, description: 'Số lượng gợi ý (mặc định 5)' },
            useAntiWaste: { type: 'BOOLEAN' as any, description: 'Có ưu tiên sử dụng nguyên liệu sắp hết hạn trong tủ lạnh không (mặc định true)' },
            excludeIds: {
              type: 'ARRAY' as any,
              items: { type: 'STRING' as any },
              description: 'Danh sách ID các món ăn muốn loại trừ không gợi ý trùng lặp (ví dụ: các món đã có trong thực đơn).',
            },
          },
        },
      },
      {
        name: 'get_inventory',
        description: 'Xem toàn bộ các nguyên liệu đang có sẵn trong tủ lạnh (inventory) của người dùng.',
        parameters: { type: 'OBJECT' as any, properties: {} },
      },
      {
        name: 'get_expiring_items',
        description: 'Kiểm tra và tìm các nguyên liệu trong tủ lạnh của người dùng sắp hết hạn sử dụng (trong vòng 7 ngày tới) hoặc ở mức cảnh báo.',
        parameters: { type: 'OBJECT' as any, properties: {} },
      },
      {
        name: 'search_ingredients',
        description: 'Tìm kiếm nguyên liệu trong danh mục hệ thống để lấy ID chính xác khi muốn thêm vào tủ lạnh.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            query: { type: 'STRING' as any, description: 'Tên nguyên liệu cần tìm (ví dụ: trứng, sữa, thịt bò...)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_to_inventory',
        description: 'Thêm một nguyên liệu mới vào tủ lạnh của người dùng để theo dõi hạn sử dụng.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            ingredientId: { type: 'STRING' as any, description: 'ID của nguyên liệu trong hệ thống' },
            quantity: { type: 'NUMBER' as any, description: 'Số lượng nguyên liệu' },
            unit: { type: 'STRING' as any, description: 'Đơn vị tính (ví dụ: g, quả, hộp, lít...)' },
            expirationDate: { type: 'STRING' as any, description: 'Ngày hết hạn định dạng YYYY-MM-DD (nếu có)' },
            notes: { type: 'STRING' as any, description: 'Ghi chú thêm' },
          },
          required: ['ingredientId', 'quantity', 'unit'],
        },
      },
      {
        name: 'generate_meal_plan',
        description: 'Tự động lên thực đơn/kế hoạch ăn uống thông minh cho cả tuần dựa trên sở thích và dinh dưỡng. Không tạo món cho ngày đã qua; nếu là tuần hiện tại thì chỉ tạo từ hôm nay trở đi.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            weekStart: { type: 'STRING' as any, description: 'Ngày bắt đầu của tuần định dạng YYYY-MM-DD (phải là ngày Thứ Hai, không thuộc tuần đã qua)' },
            useAntiWaste: { type: 'BOOLEAN' as any, description: 'Có ưu tiên nấu các nguyên liệu đang sắp hết hạn trong tủ lạnh không (mặc định true)' },
            overwrite: { type: 'BOOLEAN' as any, description: 'Đặt là true nếu muốn tạo lại/thiết lập lại toàn bộ thực đơn tuần mới (ghi đè các món cũ không bị khóa).' },
          },
        },
      },
      {
        name: 'get_meal_plan',
        description: 'Xem thực đơn / kế hoạch ăn uống hiện tại của người dùng cho một tuần cụ thể.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            weekStart: { type: 'STRING' as any, description: 'Ngày bắt đầu của tuần định dạng YYYY-MM-DD (Thứ Hai)' },
          },
        },
      },
      {
        name: 'get_shopping_lists',
        description: 'Xem các danh sách mua sắm hiện có của người dùng.',
        parameters: { type: 'OBJECT' as any, properties: {} },
      },
      {
        name: 'generate_shopping_list',
        description: 'Tạo danh sách mua sắm nguyên liệu tự động từ một kế hoạch thực đơn (meal plan) cụ thể, tự động trừ đi nguyên liệu đã có trong tủ lạnh. Có thể tùy chọn tạo cho các ngày cụ thể.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            mealPlanId: { type: 'STRING' as any, description: 'ID của thực đơn tuần cần tạo danh sách mua sắm' },
            days: {
              type: 'ARRAY' as any,
              items: { type: 'NUMBER' as any },
              description: 'Mảng số nguyên đại diện cho các ngày cụ thể trong tuần muốn tạo nguyên liệu đi chợ (1: Thứ Hai, 2: Thứ Ba, ..., 7: Chủ Nhật). Để trống nếu muốn xuất cả tuần.',
            },
          },
          required: ['mealPlanId'],
        },
      },
      {
        name: 'add_to_meal_plan',
        description: 'Thêm hoặc cập nhật một món ăn cụ thể vào một ngày và buổi ăn xác định trong thực đơn tuần của người dùng. Chỉ chọn ngày hôm nay hoặc tương lai.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            recipeId: { type: 'STRING' as any, description: 'ID của công thức món ăn muốn thêm. Nếu không có ID nhưng có tên món ăn cụ thể, hãy bỏ trống recipeId và điền recipeName.' },
            recipeName: { type: 'STRING' as any, description: 'Tên món ăn muốn thêm (ví dụ: phở bò, cháo gà) nếu chưa có recipeId.' },
            mealDate: { type: 'STRING' as any, description: 'Ngày cụ thể muốn thêm món ăn, định dạng YYYY-MM-DD (ví dụ: 2026-06-08)' },
            mealType: { type: 'STRING' as any, description: 'Loại bữa ăn: breakfast (Sáng), lunch (Trưa), dinner (Tối)' },
            dayOfWeek: { type: 'NUMBER' as any, description: 'Ngày trong tuần (1: Thứ Hai, 2: Thứ Ba, ..., 7: Chủ Nhật) - Fallback nếu không có mealDate' },
            weekStart: { type: 'STRING' as any, description: 'Ngày bắt đầu của tuần YYYY-MM-DD - Fallback nếu không có mealDate' },
            overwrite: { type: 'BOOLEAN' as any, description: 'Đặt là true nếu đây là yêu cầu thay đổi, đổi món, hoặc thay thế món ăn đã có sẵn trong bữa ăn.' },
          },
          required: ['mealDate', 'mealType'],
        },
      },
      {
        name: 'remove_from_meal_plan',
        description: 'Xóa hoặc hủy một món ăn khỏi bữa ăn cụ thể (Sáng, Trưa, Tối) trong thực đơn tuần của người dùng.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            mealDate: { type: 'STRING' as any, description: 'Ngày cụ thể muốn xóa món ăn, định dạng YYYY-MM-DD (ví dụ: 2026-06-08)' },
            mealType: { type: 'STRING' as any, description: 'Loại bữa ăn muốn xóa: breakfast (Sáng), lunch (Trưa), dinner (Tối)' },
            dayOfWeek: { type: 'NUMBER' as any, description: 'Ngày trong tuần muốn xóa (1-7) - Fallback nếu không có mealDate' },
            weekStart: { type: 'STRING' as any, description: 'Ngày bắt đầu của tuần YYYY-MM-DD - Fallback nếu không có mealDate' },
            recipeId: { type: 'STRING' as any, description: 'ID của công thức món ăn muốn xóa cụ thể. Nếu để trống, hệ thống sẽ xóa toàn bộ các món ăn trong bữa ăn này.' },
          },
          required: ['mealDate', 'mealType'],
        },
      },
      {
        name: 'delete_meal_plan',
        description: 'Xóa hoàn toàn thực đơn tuần hiện tại của người dùng.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            weekStart: { type: 'STRING' as any, description: 'Ngày bắt đầu của tuần YYYY-MM-DD cần xóa. Để trống nếu là tuần hiện tại.' },
          },
        },
      },
      {
        name: 'generate_meal_plan_for_days',
        description: 'Tự động tạo hoặc cập nhật thực đơn tuần chỉ dành cho một hoặc một vài ngày được chọn (giữ nguyên các ngày khác). Chỉ tạo cho hôm nay hoặc ngày tương lai.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            mealDates: {
              type: 'ARRAY' as any,
              items: { type: 'STRING' as any },
              description: 'Mảng chuỗi các ngày cụ thể cần tạo thực đơn, định dạng YYYY-MM-DD (ví dụ: ["2026-06-08", "2026-06-09"]).',
            },
            days: {
              type: 'ARRAY' as any,
              items: { type: 'NUMBER' as any },
              description: 'Mảng số nguyên các ngày (1-7) - Fallback nếu không có mealDates.',
            },
            weekStart: { type: 'STRING' as any, description: 'Ngày bắt đầu của tuần YYYY-MM-DD - Fallback nếu không có mealDates.' },
            useAntiWaste: { type: 'BOOLEAN' as any, description: 'Có ưu tiên sử dụng nguyên liệu sắp hết hạn trong tủ lạnh không.' },
            mealType: { type: 'STRING' as any, description: 'Loại bữa ăn muốn tạo: breakfast (Sáng), lunch (Trưa), dinner (Tối). Để trống nếu muốn tạo cả ngày.' },
            overwrite: { type: 'BOOLEAN' as any, description: 'Đặt là true nếu người dùng yêu cầu làm mới hoặc tạo lại thực đơn của ngày hôm nay/ngày cụ thể (ghi đè món cũ không bị khóa). Mặc định false chỉ gợi ý món còn thiếu.' },
          },
          required: ['mealDates'],
        },
      },
      {
        name: 'get_recipe_ratings',
        description: 'Lấy danh sách các đánh giá, bình luận và điểm số trung bình của món ăn cụ thể.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            recipeId: { type: 'STRING' as any, description: 'ID duy nhất của công thức món ăn (nếu có)' },
            recipeName: { type: 'STRING' as any, description: 'Tên món ăn (ví dụ: Phở bò, Canh chua) để tìm kiếm nếu chưa có ID' },
          },
        },
      },
      {
        name: 'calculate_calories',
        description: 'Tính toán chỉ số năng lượng hàng ngày (TDEE) và phân bổ calo lý tưởng cho các bữa ăn dựa trên cân nặng, chiều cao, giới tính, tuổi tác và mức độ vận động.',
        parameters: { type: 'OBJECT' as any, properties: {} },
      },
      {
        name: 'navigate_to',
        description: 'Điều hướng người dùng đến một trang cụ thể trên ứng dụng MealAI (như Tủ lạnh, Lập thực đơn, Danh sách mua sắm, Công thức, Dinh dưỡng, Trang cá nhân).',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            page: {
              type: 'STRING' as any,
              description: 'Tên trang cần đến: "inventory" (Tủ lạnh/Kho nguyên liệu), "meal-planner" (Lập thực đơn), "shopping-list" (Danh sách mua sắm), "recipes" (Công thức nấu ăn), "profile" (Trang cá nhân / cấu hình sức khỏe), "nutrition" (Dinh dưỡng / calories), "home" (Trang chủ)'
            }
          },
          required: ['page']
        }
      },
      {
        name: 'update_user_preferences',
        description: 'Cập nhật hồ sơ sức khỏe và chế độ ăn uống của người dùng dựa trên yêu cầu của họ (ví dụ: chuyển sang giảm cân, tăng cơ, tiểu đường, cao huyết áp, ăn chay).',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            healthConditions: {
              type: 'STRING' as any,
              description: 'Các bệnh lý phân tách bởi dấu phẩy: "diabetes" (tiểu đường), "hypertension" (cao huyết áp), "weight_loss" (giảm cân), "muscle_gain" (tăng cơ), hoặc "none" để xóa bỏ.'
            },
            dietType: {
              type: 'STRING' as any,
              description: 'Chế độ ăn kiêng: "vegetarian" (ăn chay), "keto" (keto), "lowcarb" (lowcarb), hoặc "none" để xóa bỏ.'
            },
            maxSugarPerMeal: { type: 'NUMBER' as any, description: 'Lượng đường tối đa mỗi bữa ăn (g)' },
            maxSodiumPerMeal: { type: 'NUMBER' as any, description: 'Lượng natri/muối tối đa mỗi bữa ăn (mg)' },
            minProteinPerMeal: { type: 'NUMBER' as any, description: 'Lượng protein/đạm tối thiểu mỗi bữa ăn (g)' }
          }
        }
      }
    ];
  }

  async getHistory(userId: string): Promise<ChatMessage[]> {
    return await this.chatMessageRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
      take: 50, // Limit to recent 50 messages to keep chat light
    });
  }

  async clearHistory(userId: string): Promise<void> {
    await this.chatMessageRepo.delete({ userId });
  }

  async logUserAction(userId: string, data: any): Promise<UserActionLog> {
    const log = this.actionLogRepo.create({
      userId,
      actionType: data.actionType,
      recipeId: data.recipeId,
      mealType: data.mealType,
      metaData: {
        reason: data.reason,
        cookingTime: data.cookingTime,
        calories: data.calories,
      },
    });
    return await this.actionLogRepo.save(log);
  }

  async sendMessage(userId: string, content: string): Promise<{ text: string; actionTaken?: any }> {
    // 1. Save user message to database
    const userMsg = this.chatMessageRepo.create({
      userId,
      role: 'user',
      content,
    });
    await this.chatMessageRepo.save(userMsg);

    // Fetch user context (name, allergies, dietType, servings)
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });
    const fullName = user?.fullName || 'Người dùng';
    const allergies = user?.preferences?.allergies || [];
    const dietType = user?.preferences?.dietType || 'Bình thường';
    const servings = user?.preferences?.servings || 4;
    const todayValue = this.formatDateInput(new Date());
    const currentWeekStart = this.getMondayString(new Date());

    // Load current week's meal plan to inject as context
    let mealPlanContext = 'Hiện tại chưa có thực đơn nào cho tuần này.';
    try {
      const currentPlan = await this.actionHandler.mealPlanService.findByWeek(userId, currentWeekStart);
      if (currentPlan && currentPlan.items && currentPlan.items.length > 0) {
        const activeItems = currentPlan.items.filter((item: any) => item.recipe);
        if (activeItems.length > 0) {
          mealPlanContext = activeItems
            .map((item: any) => `- ${item.dayLabel} (Bữa ${item.mealType === 'breakfast' ? 'Sáng' : item.mealType === 'lunch' ? 'Trưa' : 'Tối'}): ${item.recipe.name} [ID: ${item.recipe.id}]`)
            .join('\n');
        }
      }
    } catch (e: any) {
      this.logger.error(`Failed to load meal plan context for chatbot: ${e.message}`);
    }

    // If Gemini key is missing, respond with mock rule-based fallback
    if (!this.genAI) {
      return this.handleFallback(userId, content);
    }

    try {
      // 2. Fetch history for context
      const history = await this.getHistory(userId);
      const contents = history.map((h) => ({
        role: h.role,
        parts: [{ text: h.content }],
      }));

      // 3. Initialize model with tools and personalized instructions
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: { temperature: 0.2 },
        systemInstruction: `Bạn là MealAI Assistant - Trợ lý ẩm thực và dinh dưỡng thông minh dành cho người Việt Nam. 
Nhiệm vụ của bạn là tư vấn ẩm thực, gợi ý món ăn, lên thực đơn tuần, kiểm tra tủ lạnh, tính toán calo và danh sách mua sắm.

THÔNG TIN NGƯỜI DÙNG HIỆN TẠI:
- Tên: ${fullName}
- Dị ứng thực phẩm: ${allergies.length > 0 ? allergies.join(', ') : 'Không có'}
- Chế độ ăn: ${dietType}
- Khẩu phần ăn (Số người ăn): ${servings} người
- Hôm nay: ${todayValue}
- Tuần hiện tại bắt đầu vào: ${currentWeekStart}

THỰC ĐƠN HIỆN TẠI TUẦN NÀY CỦA NGƯỜI DÙNG:
${mealPlanContext}

QUY TẮC RẤT QUAN TRỌNG:
1. Bạn CÓ THỂ THAO TÁC trực tiếp với dữ liệu của người dùng thông qua các công cụ (tools) được cung cấp. Hãy gọi tool thích hợp ngay khi người dùng yêu cầu hành động.
2. Luôn phản hồi bằng tiếng Việt thân thiện, lịch sự, chuyên nghiệp.
3. Tuyệt đối chỉ gợi ý hoặc cung cấp các món ăn thực tế có trên hệ thống bằng cách tìm kiếm qua công cụ search_recipes hoặc gợi ý qua get_recommendations. Không tự bịa ra công thức hay món ăn lạ không có trong cơ sở dữ liệu.
4. Nếu thực hiện hành động thành công (như thêm nguyên liệu, tạo thực đơn, v.v.), hãy báo cáo rõ ràng kết quả cho người dùng.
5. Không được tạo, thêm, hoặc cập nhật thực đơn cho ngày đã qua. Nếu người dùng nói "hôm nay", "ngày mai", "ngày kia", hoặc chỉ định một ngày cụ thể (ví dụ: "đổi ngày 8/6/2026"), hãy tính ngày thật chính xác định dạng YYYY-MM-DD dựa trên thông tin Hôm nay ở trên và truyền vào đối số \`mealDate\` hoặc \`mealDates\`. TUYỆT ĐỐI không tự ý dịch chuyển sang ngày kế tiếp, ngày trước đó hoặc tuần khác. Mặc định bạn KHÔNG ĐƯỢC PHÉP thay thế, ghi đè, hoặc xóa các món ăn đã có trong thực đơn (luôn truyền \`overwrite: false\` hoặc không truyền). Chỉ truyền \`overwrite: true\` khi người dùng chỉ định rõ ràng yêu cầu thay đổi, đổi món, hoặc thay thế món ăn (ví dụ: "Đổi món bữa trưa", "Thay thế món ăn ngày mai").
6. QUY TẮC AN TOÀN DỊ ỨNG (CỰC KỲ QUAN TRỌNG):
   - Tuyệt đối không được gợi ý hay thiết kế thực đơn chứa các nguyên liệu mà người dùng bị dị ứng (${allergies.join(', ')}).
   - Nếu người dùng hỏi xin công thức hoặc hỏi xem có ăn được món ăn chứa chất dị ứng của họ hay không, bạn PHẦI cảnh báo khẩn cấp bằng biểu tượng ⚠️ và giải thích chi tiết chất gây dị ứng trong món đó để bảo vệ an toàn cho họ.
7. QUY TẮC KHẨU PHẦN ĂN (SỐ NGƯỜI ĂN) & SỐ LƯỢNG MÓN ĂN:
   - Khi gợi ý món ăn, cung cấp công thức hoặc liệt kê nguyên liệu chi tiết, bạn PHẦI dựa vào thông tin "Khẩu phần ăn (Số người ăn)" của người dùng (${servings} người) để tính toán, nhân/chia và hiển thị định lượng nguyên liệu chính xác, đủ cho số lượng người đó.
   - Hãy ghi chú rõ trong câu trả lời: "Định lượng nguyên liệu dưới đây đã được tự động quy đổi cho ${servings} người theo hồ sơ của bạn."
   - Khi thiết kế mâm cơm cho bữa trưa (lunch) hoặc bữa tối (dinner), hãy cân nhắc quy mô gia đình của họ:
     - Gia đình từ 1-2 người ăn: Chỉ gợi ý 1 món ăn đơn giản/bữa.
     - Gia đình từ 3-5 người ăn: Gợi ý mâm cơm 2 món gồm 1 món chính (thịt/cá/tôm/đậu...) + 1 món canh hoặc rau xào.
     - Gia đình từ 6 người ăn trở lên: Gợi ý mâm cơm đầy đủ 3 món gồm 1 món chính + 1 món xào/rau + 1 món canh.
8. QUY TẮC GỌI CÔNG CỤ THỰC ĐƠN:
   - Khi gọi các tool \`add_to_meal_plan\`, \`remove_from_meal_plan\`, \`generate_meal_plan_for_days\`, hãy luôn truyền ngày cụ thể dưới dạng chuỗi \`YYYY-MM-DD\` vào đối số \`mealDate\` / \`mealDates\`.
   - Nếu người dùng muốn thêm món ăn nhưng bạn chưa biết ID của món đó trong cơ sở dữ liệu, hãy điền tên món ăn vào đối số \`recipeName\` trong tool \`add_to_meal_plan\` (để trống đối số \`recipeId\`), hệ thống sẽ tự động tìm kiếm món khớp nhất để thêm.
   - Nếu người dùng muốn xóa món ăn cụ thể khỏi lịch ăn, hãy gọi tool \`remove_from_meal_plan\`.
   - Tránh gợi ý trùng lặp các món ăn đã có trong tuần này. Khi gọi tool \`get_recommendations\`, hãy truyền mảng các ID món ăn đã có ở trên vào đối số \`excludeIds\`.
   - Khi phản hồi người dùng về thực đơn được đề xuất hoặc cập nhật, hãy hiển thị định dạng chính xác những bữa nào đã được giữ nguyên và những bữa nào đã được thêm mới theo định dạng sau:
     Đã giữ nguyên:
     ✓ Bữa sáng
     ✓ Bữa tối

     Đã thêm:
     ✓ Bữa trưa

     Không có món nào bị thay thế.
9. QUY TẮC GIẢI THÍCH GỢI Ý (EXPLAINABLE AI):
   - Khi gợi ý món ăn hoặc lập thực đơn, bạn phải giải thích rõ lý do dựa trên: nguyên liệu sẵn có, đồ sắp hết hạn trong tủ lạnh, calo phù hợp mục tiêu, thời gian nấu, và sở thích ăn uống. Trích xuất thông tin này từ trường \`reasons\` trong kết quả của tool và định dạng câu trả lời thân thiện, dễ hiểu.
10. QUY TẮC XUẤT FILE PDF:
    - Khi người dùng muốn xuất/tải file PDF thực đơn tuần này, hãy cung cấp chính xác đường dẫn markdown dạng: \`[Tải xuống file PDF Thực đơn tuần này của bạn tại đây](/api/v1/meal-plans/current/pdf)\`.
    - Khi người dùng muốn xuất/tải file PDF danh sách mua sắm, bạn hãy gọi tool \`get_shopping_lists\` để lấy danh sách. Nếu có, hãy tìm ID của danh sách mua sắm gần đây nhất và trả về đường dẫn markdown dạng: \`[Tải xuống file PDF Danh sách mua sắm của bạn tại đây](/api/v1/shopping-lists/<ID_DANH_SACH_MUA_SAM>/pdf)\` (thay thế <ID_DANH_SACH_MUA_SAM> bằng ID thực tế). Nếu chưa có danh sách nào, hãy gọi tool \`generate_shopping_list\` để tạo trước rồi trả về link PDF của danh sách vừa tạo.
11. QUY TẮC XEM ĐÁNH GIÁ/BÌNH LUẬN MÓN ĂN:
    - Khi người dùng hỏi xem đánh giá, bình luận hoặc sao của một món ăn cụ thể (ví dụ: "Cho tôi xem đánh giá món Phở bò"), hãy gọi tool \`get_recipe_ratings\` với \`recipeName\` tương ứng.
    - Từ kết quả của công cụ trả về, hãy tổng hợp điểm số trung bình (sao), tổng số lượt đánh giá, và liệt kê tóm tắt các nhận xét/bình luận tiêu biểu của người dùng khác một cách ngắn gọn, sinh động.`,
      });

      // 4. Start chat session
      const chat = model.startChat({
        history: contents.slice(0, -1), // Exclude the newly saved message since we will send it in sendMessage
        tools: [{ functionDeclarations: this.getFunctions() }],
      });

      // 5. Send message (with 30s timeout to avoid hanging)
      const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini API timeout after ${ms / 1000}s`)), ms)
          ),
        ]);
      };

      const getFunctionCalls = (response: any) => {
        if (!response) return [];
        if (typeof response.functionCalls === 'function') {
          return response.functionCalls() || [];
        }
        return response.functionCalls || [];
      };

      let result = await withTimeout(chat.sendMessage(content), 30000);
      let responseText = result.response.text();
      let functionCalls = getFunctionCalls(result.response);
      let actionResult: any = null;

      // If Gemini returned empty text with no function calls, it likely failed silently
      // (e.g., invalid API key that doesn't throw). Fall back to rule-based handler.
      if (!responseText && (!functionCalls || functionCalls.length === 0)) {
        this.logger.warn('Gemini trả về kết quả rỗng (có thể do API key không hợp lệ). Chuyển sang fallback...');
        return this.handleFallback(userId, content);
      }

      // Force fallback if the user is asking to change/modify/add/remove/create dates and Gemini didn't call any tools
      const lowerContent = content.toLowerCase();
      if ((functionCalls || []).length === 0 && (
        lowerContent.includes('đổi ngày') ||
        lowerContent.includes('đổi thực đơn') ||
        lowerContent.includes('thay đổi thực đơn') ||
        lowerContent.includes('lập thực đơn') ||
        lowerContent.includes('tạo thực đơn') ||
        lowerContent.includes('xóa thực đơn') ||
        lowerContent.includes('xóa ngày')
      )) {
        this.logger.warn('Gemini không gọi tool cho yêu cầu thực đơn. Tự động chuyển sang fallback.');
        return this.handleFallback(userId, content);
      }

      // 6. Handle Multi-Step Function Calls (Autonomous Agent Loop)
      let maxSteps = 5;
      let stepCount = 0;
      const executedSteps = [];

      while (functionCalls && functionCalls.length > 0 && stepCount < maxSteps) {
        stepCount++;
        const stepCalls = functionCalls;
        const stepResponses = [];

        for (const call of stepCalls) {
          this.logger.log(`[Agent Step ${stepCount}] Gemini decided to call function: ${call.name} with args: ${JSON.stringify(call.args)}`);

          const args = { ...call.args };
          // context-threading: if mealPlanId is missing for generating a shopping list, look up previous generated plan
          if (call.name === 'generate_shopping_list' && !args.mealPlanId) {
            const prevPlanStep = executedSteps.find(s => s.name === 'generate_meal_plan' || s.name === 'generate_meal_plan_for_days');
            if (prevPlanStep && prevPlanStep.result && prevPlanStep.result.id) {
              args.mealPlanId = prevPlanStep.result.id;
            }
          }

          // Execute action on real services
          actionResult = await this.actionHandler.handleAction(call.name, args, userId);

          executedSteps.push({
            name: call.name,
            args,
            result: actionResult,
          });

          stepResponses.push({
            functionResponse: {
              name: call.name,
              response: { result: actionResult },
            },
          });
        }

        // Send function results back to Gemini to request next step or final response
        const nextResult = await withTimeout(
          chat.sendMessage(stepResponses),
          30000,
        );

        responseText = nextResult.response.text();
        functionCalls = getFunctionCalls(nextResult.response);
      }

      // If response text is empty (no final summary produced), build one from executed steps
      if (!responseText) {
        if (executedSteps.length > 0) {
          responseText = `✅ Đã thực hiện hoàn tất chuỗi thao tác tự động:\n` +
            executedSteps.map((s, idx) => `${idx + 1}. Chạy lệnh **${s.name}** thành công.`).join('\n');
        } else {
          responseText = `Tôi đã nhận yêu cầu nhưng chưa thể hoàn thành thao tác tự động lúc này.`;
        }
      }

      // 7. Save assistant message to database
      const assistantMsg = this.chatMessageRepo.create({
        userId,
        role: 'model',
        content: responseText,
        metadata: executedSteps.length > 0 ? { steps: executedSteps } : null,
      });
      await this.chatMessageRepo.save(assistantMsg);

      return {
        text: responseText,
        actionTaken: executedSteps.length > 0 ? executedSteps[executedSteps.length - 1] : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Error communicating with Gemini: ${err.message}`, err.stack);
      this.logger.warn('Gemini gặp lỗi, chuyển sang rule-based fallback để xử lý yêu cầu người dùng...');

      // When Gemini fails at runtime (bad API key, network error, quota exceeded, etc.),
      // fall back to the rule-based handler so the user still gets meaningful actions performed.
      return this.handleFallback(userId, content);
    }
  }

  // Custom high-fidelity rule-based fallback if GEMINI_API_KEY is not defined
  private async handleFallback(userId: string, content: string): Promise<{ text: string; actionTaken?: any }> {
    const text = content.toLowerCase();
    let responseText = '';
    let actionTaken: any = null;

    // Load user allergies to trigger proactive safety warnings
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['preferences'],
    });
    const allergies = user?.preferences?.allergies || [];
    const dateSelections = this.parseDateSelections(text);
    const requestedMealType = this.parseMealTypeFromText(text);

    // ── NEW: Lệnh điều hướng giao diện (UI Navigation Commands)
    const isInventoryPage = text.includes('mở tủ lạnh') || text.includes('đi tới tủ lạnh') || text.includes('xem tủ lạnh') || text.includes('vào tủ lạnh') || text.includes('kho nguyên liệu') || text.trim() === 'tủ lạnh';
    const isMealPlannerPage = text.includes('mở thực đơn') || text.includes('đi tới thực đơn') || text.includes('lịch ăn') || text.includes('kế hoạch ăn') || text.includes('trang thực đơn') || text.trim() === 'thực đơn';
    const isShoppingListPage = text.includes('mở danh sách mua sắm') || text.includes('mở danh sách đi chợ') || text.includes('đi tới danh sách mua sắm') || text.includes('trang mua sắm') || text.includes('trang đi chợ');
    const isRecipesPage = text.includes('mở trang công thức') || text.includes('đi tới công thức') || text.includes('tìm món ăn') || text.includes('trang công thức');
    const isProfilePage = text.includes('mở trang cá nhân') || text.includes('đi tới trang cá nhân') || text.includes('hồ sơ cá nhân') || text.includes('mở hồ sơ') || text.includes('trang cá nhân');
    const isNutritionPage = text.includes('mở trang dinh dưỡng') || text.includes('đi tới trang dinh dưỡng') || text.includes('xem dinh dưỡng') || text.includes('biểu đồ dinh dưỡng') || text.includes('trang dinh dưỡng');
    const isHomePage = text.includes('về trang chủ') || text.includes('đi tới trang chủ') || text.trim() === 'trang chủ';

    if (isInventoryPage) {
      actionTaken = { name: 'navigate_to', args: { page: 'inventory' } };
      responseText = 'Đang mở tủ lạnh của bạn.';
    } else if (isMealPlannerPage) {
      actionTaken = { name: 'navigate_to', args: { page: 'meal-planner' } };
      responseText = 'Đang mở trang lập thực đơn và lịch ăn.';
    } else if (isShoppingListPage) {
      actionTaken = { name: 'navigate_to', args: { page: 'shopping-list' } };
      responseText = 'Đang mở danh sách đi chợ của bạn.';
    } else if (isRecipesPage) {
      actionTaken = { name: 'navigate_to', args: { page: 'recipes' } };
      responseText = 'Đang mở danh mục công thức nấu ăn.';
    } else if (isProfilePage) {
      actionTaken = { name: 'navigate_to', args: { page: 'profile' } };
      responseText = 'Đang mở hồ sơ sức khỏe cá nhân.';
    } else if (isNutritionPage) {
      actionTaken = { name: 'navigate_to', args: { page: 'nutrition' } };
      responseText = 'Đang mở trang thống kê dinh dưỡng.';
    } else if (isHomePage) {
      actionTaken = { name: 'navigate_to', args: { page: 'home' } };
      responseText = 'Đang quay về trang chủ MealAI.';
    }

    if (actionTaken && actionTaken.name === 'navigate_to') {
      const assistantMsg = this.chatMessageRepo.create({
        userId,
        role: 'model',
        content: responseText,
      });
      await this.chatMessageRepo.save(assistantMsg);
      return { text: responseText, actionTaken };
    }

    // ── NEW: Lệnh cập nhật cấu hình sức khỏe (Update Preferences Commands)
    const isDiabetesReq = text.includes('tiểu đường') || text.includes('đái tháo đường');
    const isHypertensionReq = text.includes('cao huyết áp') || text.includes('tăng huyết áp');
    const isWeightLossReq = text.includes('giảm cân') || text.includes('giảm béo');
    const isMuscleGainReq = text.includes('tăng cơ') || text.includes('phát triển cơ');
    const isVegetarianReq = text.includes('ăn chay') || text.includes('thực đơn chay') || text.includes('món chay');
    const isKetoReq = text.includes('ăn keto') || text.includes('chế độ keto');
    const isLowcarbReq = text.includes('ăn lowcarb') || text.includes('chế độ lowcarb') || text.includes('low carb');

    let updateArgs: any = null;
    let updateResponse = '';

    if (isDiabetesReq) {
      updateArgs = { healthConditions: 'diabetes' };
      updateResponse = 'Đã cập nhật hồ sơ sức khỏe: Ưu tiên chế độ ăn cho người tiểu đường (kiểm soát đường huyết).';
    } else if (isHypertensionReq) {
      updateArgs = { healthConditions: 'hypertension' };
      updateResponse = 'Đã cập nhật hồ sơ sức khỏe: Ưu tiên chế độ ăn giảm muối/natri cho người cao huyết áp.';
    } else if (isWeightLossReq) {
      updateArgs = { healthConditions: 'weight_loss', dietType: 'weight_loss' };
      updateResponse = 'Đã chuyển chế độ ăn của bạn sang: Giảm cân (kiểm soát chặt chẽ calo bữa ăn).';
    } else if (isMuscleGainReq) {
      updateArgs = { healthConditions: 'muscle_gain' };
      updateResponse = 'Đã chuyển chế độ ăn của bạn sang: Tăng cơ (ưu tiên hàm lượng protein cao).';
    } else if (isVegetarianReq) {
      updateArgs = { dietType: 'vegetarian' };
      updateResponse = 'Đã cập nhật chế độ ăn uống của bạn sang: Ăn chay.';
    } else if (isKetoReq) {
      updateArgs = { dietType: 'keto' };
      updateResponse = 'Đã cập nhật chế độ ăn uống của bạn sang: Keto.';
    } else if (isLowcarbReq) {
      updateArgs = { dietType: 'lowcarb' };
      updateResponse = 'Đã cập nhật chế độ ăn uống của bạn sang: Lowcarb.';
    }

    if (updateArgs) {
      actionTaken = { name: 'update_user_preferences', args: updateArgs };
      const res = await this.actionHandler.handleAction('update_user_preferences', updateArgs, userId);
      actionTaken.result = res;
      responseText = updateResponse;

      const assistantMsg = this.chatMessageRepo.create({
        userId,
        role: 'model',
        content: responseText,
      });
      await this.chatMessageRepo.save(assistantMsg);
      return { text: responseText, actionTaken };
    }

    // Check if the user mentioned any of their allergens
    const matchedAllergen = allergies.find(allergy => {
      const trimmed = allergy.toLowerCase().trim();
      return trimmed && text.includes(trimmed);
    });

    if (matchedAllergen) {
      responseText = `⚠️ **CẢNH BÁO NGUY HIỂM (DỊ ỨNG THỰC PHẨM):**\n\n` +
        `Chào bạn, hệ thống ghi nhận hồ sơ sức khỏe của bạn dị ứng với **"${matchedAllergen.toUpperCase()}"**.\n` +
        `Câu hỏi hoặc món ăn bạn vừa nhắc tới có thể chứa thành phần gây nguy hiểm cho sức khỏe của bạn! ` +
        `Để đảm bảo an toàn tuyệt đối, vui lòng tránh xa món này và ưu tiên các nguyên liệu lành tính khác nhé!`;
        
      const assistantMsg = this.chatMessageRepo.create({
        userId,
        role: 'model',
        content: responseText,
      });
      await this.chatMessageRepo.save(assistantMsg);
      return { text: responseText };
    }

    // ── NEW: "cả 3 bữa luôn" / "cà 3 bữa" / "3 bữa hôm nay"
    const isChangePlanRequest = text.includes('đổi thực đơn') || 
                                text.includes('thay đổi thực đơn') || 
                                text.includes('tạo thực đơn mới') || 
                                text.includes('lên thực đơn mới') || 
                                text.includes('làm mới thực đơn');

    const isAllMealsToday = text.includes('cả 3 bữa') || text.includes('cà 3 bữa') ||
                            (text.includes('3 bữa') && (text.includes('luôn') || text.includes('hôm nay') || text.includes('hm nay'))) ||
                            text.includes('tất cả bữa') || text.includes('hết bữa') ||
                            (text.includes('đủ bữa') && text.includes('hôm'));

    // ── "thêm vài món nữa" / "thêm vô" / "thêm vào" (without a specific dish name)
    const isAddMultipleVague =
      text.includes('thêm vài') || text.includes('thêm nhiều') ||
      text.includes('thêm thêm') || text.includes('thêm nữa') ||
      text.includes('món nữa') ||
      // "thêm vô" = Southern Vietnamese dialect for "thêm vào"
      (text.includes('thêm') && text.includes('vô') && !text.includes('thực đơn')) ||
      // "thêm vào" without specifying a dish
      (text.includes('thêm') && (text.includes('vào') || text.includes('vô')) &&
       !text.includes('thực đơn') && this.cleanRecipeQuery(text) === '');

    // ── "sáng" / "trưa" / "tối" as a standalone reply → add recommendation for that meal today
    const isSingleMealTime = (text === 'sáng' || text === 'trưa' || text === 'tối' ||
                              text === 'bữa sáng' || text === 'bữa trưa' || text === 'bữa tối' ||
                              text === 'buổi sáng' || text === 'buổi trưa' || text === 'buổi tối');

    // ── NEW: "healthy" / "lành mạnh" / "ít calo"
    const isHealthyRequest = text.includes('healthy') || text.includes('lành mạnh') ||
                             text.includes('ít calo') || text.includes('ít béo') ||
                             text.includes('eat clean') || text.includes('ăn sạch') ||
                             text.includes('giảm cân') || text.includes('diet');

    if (isSingleMealTime) {
      // User replied with just a meal time → add AI recommendation for that meal today
      const today = this.dateOnly(new Date());
      const weekStart = this.getMondayString(today);
      const dayOfWeek = this.getMealPlanDay(today);
      const mealType = this.parseMealTypeFromText(text);
      const mealLabel = mealType === 'breakfast' ? 'Sáng' : mealType === 'lunch' ? 'Trưa' : 'Tối';

      const recRes = await this.actionHandler.handleAction('get_recommendations', { mealType, limit: 1, useAntiWaste: true }, userId);
      const recipe = recRes.recommendations?.[0]?.recipe;
      if (!recipe?.id) {
        responseText = `Không tìm được món phù hợp cho bữa ${mealLabel} hôm nay. Hãy thử "gợi ý ${mealLabel.toLowerCase()} nay" nhé!`;
      } else {
        actionTaken = { name: 'add_to_meal_plan', args: { recipeId: recipe.id, dayOfWeek, mealType, weekStart } };
        const addRes = await this.actionHandler.handleAction('add_to_meal_plan', actionTaken.args, userId);
        actionTaken.result = addRes;
        if (addRes.error) {
          responseText = `Không thể thêm món: ${addRes.error}`;
        } else {
          responseText = `✅ Đã thêm **${recipe.name}** vào Bữa **${mealLabel}** hôm nay!\n(${recipe.calories} kcal, nấu trong ${recipe.cookingTime} phút)`;
        }
      }
    } else if (isAllMealsToday) {
      // Generate all 3 meals for today
      const today = this.dateOnly(new Date());
      const weekStart = this.getMondayString(today);
      const dayOfWeek = this.getMealPlanDay(today);
      actionTaken = { name: 'generate_meal_plan_for_days', args: { weekStart, days: [dayOfWeek], useAntiWaste: true } };
      const res = await this.actionHandler.handleAction('generate_meal_plan_for_days', { weekStart, days: [dayOfWeek], useAntiWaste: true }, userId);
      actionTaken.result = res;
      if (res.error) {
        responseText = `⚠️ Không thể tạo thực đơn: ${res.error}`;
      } else {
        const todayItems = (res.items || []).filter((i: any) => i.dayOfWeek === dayOfWeek);
        responseText = `🎉 **Đã lên thực đơn cả 3 bữa hôm nay!**\n\n` +
          (todayItems.length > 0
            ? todayItems.map((i: any) => `- **Bữa ${i.mealType === 'breakfast' ? 'Sáng' : i.mealType === 'lunch' ? 'Trưa' : 'Tối'}**: ${i.recipe ? i.recipe.name : 'Chưa có món'}`).join('\n')
            : '- Thực đơn đã được cập nhật!') +
          `\n\nBạn có thể xem chi tiết ở trang Lịch Ăn nhé! 📅`;
      }
    } else if (isAddMultipleVague) {
      // Auto-fill empty meal slots for today using AI recommendations
      const today = this.dateOnly(new Date());
      const weekStart = this.getMondayString(today);
      const dayOfWeek = this.getMealPlanDay(today);
      const existingPlan = await this.actionHandler.mealPlanService.findByWeek(userId, weekStart);
      const filledSlots = existingPlan?.items
        ?.filter((i: any) => i.dayOfWeek === dayOfWeek && i.recipe)
        .map((i: any) => i.mealType) || [];
      const emptyMeals = ['breakfast', 'lunch', 'dinner'].filter((m) => !filledSlots.includes(m));

      if (emptyMeals.length === 0) {
        responseText = `✅ Hôm nay bạn đã có đủ 3 bữa rồi! 🎉 Bạn có muốn xem thực đơn không?`;
      } else {
        const addedMeals: string[] = [];
        for (const mealType of emptyMeals) {
          const recRes = await this.actionHandler.handleAction('get_recommendations', { mealType, limit: 1, useAntiWaste: true }, userId);
          const recipe = recRes.recommendations?.[0]?.recipe;
          if (recipe?.id) {
            await this.actionHandler.handleAction('add_to_meal_plan', { recipeId: recipe.id, dayOfWeek, mealType, weekStart }, userId);
            addedMeals.push(`Bữa ${mealType === 'breakfast' ? 'Sáng' : mealType === 'lunch' ? 'Trưa' : 'Tối'}: **${recipe.name}**`);
          }
        }
        actionTaken = { name: 'generate_meal_plan_for_days', args: { weekStart, days: [dayOfWeek] }, result: existingPlan };
        if (addedMeals.length > 0) {
          responseText = `✅ **Đã thêm các món cho hôm nay:**\n\n` +
            addedMeals.map((m) => `- ${m}`).join('\n') +
            `\n\nThực đơn đã được cập nhật! Bạn có thể xem ở trang Lịch Ăn.`;
        } else {
          responseText = `Không tìm được món phù hợp để thêm. Hãy thử lệnh **"gợi ý món ăn"** để xem các lựa chọn nhé!`;
        }
      }
    } else if (isHealthyRequest) {
      // Healthy/low-cal recommendations
      const healthArgs = { maxCalories: 400, limit: 5 };
      actionTaken = { name: 'search_recipes', args: healthArgs };
      const res = await this.actionHandler.handleAction('search_recipes', healthArgs, userId);
      actionTaken.result = res;
      if (!res.data || res.data.length === 0) {
        responseText = `🥗 Hiện chưa tìm được món ăn lành mạnh (dưới 400 kcal) phù hợp. Hãy thêm nhiều công thức healthy vào hệ thống nhé!`;
      } else {
        responseText = `🥗 **Gợi ý món ăn lành mạnh (dưới 400 kcal):**\n\n` +
          res.data.slice(0, 5).map((r: any) => `- **${r.name}** \u2013 ${r.calories} kcal | ${r.cookingTime} phút`).join('\n') +
          `\n\nBạn muốn thêm món nào vào thực đơn không?`;
      }
    } else if (
      text === 'có' || 
      text === 'đồng ý' || 
      text === 'ok' || 
      text === 'đúng' ||
      text === 'dung' ||
      text === 'bạn đúng' ||
      text === 'ban dung' ||
      isChangePlanRequest ||
      ((text.includes('lên thực đơn') || text.includes('tạo thực đơn')) && dateSelections.length === 0)
    ) {
      let isDayContext = false;
      let targetDays: number[] = [];
      const today = new Date();
      const currentDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();

      if (
        text === 'ok' ||
        text === 'đồng ý' ||
        text === 'có' ||
        text === 'đúng' ||
        text === 'dung' ||
        text === 'bạn đúng' ||
        text === 'ban dung'
      ) {
        const lastModelMsg = await this.chatMessageRepo.findOne({
          where: { userId, role: 'model' },
          order: { createdAt: 'DESC' },
        });
        if (lastModelMsg) {
          const lastContent = lastModelMsg.content.toLowerCase();
          
          // Parse date and weekStart
          let confirmDayOfWeek = currentDayOfWeek;
          let confirmWeekStart = this.getMondayString(new Date());
          let parsedDay = false;

          const dateMatch = /(\d{2})[-/](\d{2})[-/](\d{4})/.exec(lastContent);
          if (dateMatch) {
            const day = Number(dateMatch[1]);
            const month = Number(dateMatch[2]) - 1;
            const year = Number(dateMatch[3]);
            const parsedDate = new Date(year, month, day);
            if (!isNaN(parsedDate.getTime())) {
              confirmDayOfWeek = parsedDate.getDay() === 0 ? 7 : parsedDate.getDay();
              confirmWeekStart = this.getMondayString(parsedDate);
              parsedDay = true;
            }
          }

          if (!parsedDay) {
            if (lastContent.includes('ngày mai')) {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              confirmDayOfWeek = tomorrow.getDay() === 0 ? 7 : tomorrow.getDay();
              confirmWeekStart = this.getMondayString(tomorrow);
              parsedDay = true;
            } else if (lastContent.includes('hôm nay') || lastContent.includes('ngày hôm nay')) {
              confirmDayOfWeek = currentDayOfWeek;
              confirmWeekStart = this.getMondayString(new Date());
              parsedDay = true;
            } else {
              const dayMap: Record<string, number> = {
                'thứ hai': 1, 'thứ 2': 1,
                'thứ ba': 2, 'thứ 3': 2,
                'thứ tư': 3, 'thứ 4': 3,
                'thứ năm': 4, 'thứ 5': 4,
                'thứ sáu': 5, 'thứ 6': 5,
                'thứ bảy': 6, 'thứ 7': 6,
                'chủ nhật': 7, 'cn': 7,
              };
              for (const [key, val] of Object.entries(dayMap)) {
                if (lastContent.includes(key)) {
                  confirmDayOfWeek = val;
                  confirmWeekStart = this.getMondayString(new Date());
                  parsedDay = true;
                }
              }
            }
          }

          const isDeleteConfirmation = lastContent.includes('muốn xóa') || (lastContent.includes('xóa') && (lastContent.includes('phải không') || lastContent.includes('không?')));

          if (isDeleteConfirmation && parsedDay) {
            // Parse meal type from the last message context
            let confirmMealType = 'lunch';
            if (lastContent.includes('sáng') || lastContent.includes('breakfast')) confirmMealType = 'breakfast';
            else if (lastContent.includes('tối') || lastContent.includes('dinner')) confirmMealType = 'dinner';
            else if (lastContent.includes('phụ') || lastContent.includes('snack')) confirmMealType = 'snack';

            let recipeId = undefined;
            if (lastModelMsg.metadata && (lastModelMsg.metadata as any).args && (lastModelMsg.metadata as any).args.recipeId) {
              recipeId = (lastModelMsg.metadata as any).args.recipeId;
            }

            actionTaken = {
              name: 'remove_from_meal_plan',
              args: {
                weekStart: confirmWeekStart,
                dayOfWeek: confirmDayOfWeek,
                mealType: confirmMealType,
                recipeId: recipeId
              }
            };
            const res = await this.actionHandler.handleAction('remove_from_meal_plan', actionTaken.args, userId);
            actionTaken.result = res;
            if (res.error) {
              responseText = `⚠️ Không thể xóa món ăn: ${res.error}`;
            } else {
              responseText = `✅ **Thành công!** ${res.message || 'Đã xóa món ăn khỏi thực đơn.'}`;
            }
            
            const assistantMsg = this.chatMessageRepo.create({
              userId,
              role: 'model',
              content: responseText,
              metadata: actionTaken ? { action: actionTaken.name, result: actionTaken.result, args: actionTaken.args } : null,
            });
            await this.chatMessageRepo.save(assistantMsg);
            return { text: responseText, actionTaken };
          }

          if (lastContent.includes('hôm nay') || lastContent.includes('ngày hôm nay')) {
            isDayContext = true;
            targetDays = [currentDayOfWeek];
          } else {
            const dayMap: Record<string, number> = {
              'thứ hai': 1, 'thứ 2': 1,
              'thứ ba': 2, 'thứ 3': 2,
              'thứ tư': 3, 'thứ 4': 3,
              'thứ năm': 4, 'thứ 5': 4,
              'thứ sáu': 5, 'thứ 6': 5,
              'thứ bảy': 6, 'thứ 7': 6,
              'chủ nhật': 7, 'cn': 7,
            };
            for (const [key, val] of Object.entries(dayMap)) {
              if (lastContent.includes(key)) {
                isDayContext = true;
                targetDays.push(val);
              }
            }
          }
        }
      }

      if (isDayContext && targetDays.length > 0) {
        const todayDate = this.dateOnly(new Date());
        const weekStart = this.getMondayString(todayDate);
        actionTaken = { name: 'generate_meal_plan_for_days', args: { weekStart, days: targetDays, useAntiWaste: true } };
        const res = await this.actionHandler.handleAction('generate_meal_plan_for_days', { weekStart, days: targetDays, useAntiWaste: true }, userId);
        actionTaken.result = res;
        if (res.error) {
          responseText = `⚠️ Không thể tạo thực đơn: ${res.error}`;
        } else {
          const dayLabelsMap = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
          const todayItems = (res.items || []).filter((i: any) => targetDays.includes(i.dayOfWeek));
          const dayLabels = targetDays.map(d => dayLabelsMap[d]).join(', ');
          responseText = `🎉 **Đã lên thực đơn cho ${dayLabels} thành công!**\n\n` +
            (todayItems.length > 0
              ? todayItems.map((i: any) => `- **${i.dayLabel} - Bữa ${i.mealType === 'breakfast' ? 'Sáng' : i.mealType === 'lunch' ? 'Trưa' : 'Tối'}**: ${i.recipe ? i.recipe.name : 'Chưa có món'}`).join('\n')
              : '- Thực đơn đã được cập nhật!') +
            `\n\nBạn có thể xem lịch ăn chi tiết ở trang Lịch Ăn nhé! 📅`;
        }
      } else {
        actionTaken = { name: 'generate_meal_plan', args: { useAntiWaste: true } };
        const res = await this.actionHandler.handleAction('generate_meal_plan', { useAntiWaste: true }, userId);
        actionTaken.result = res;
        if (res.error) {
          responseText = `Không thể tạo thực đơn tự động: ${res.error}`;
        } else {
          responseText = `🎉 Tuyệt vời! Tôi đã tự động thiết kế một thực đơn tuần dinh dưỡng, cân đối calo và tối ưu hóa nguyên liệu trong tủ lạnh của bạn thành công!\n\n` +
            `**Chi tiết thực đơn:**\n` +
            res.items.slice(0, 7).map((i: any) => `- **${i.dayLabel}** (${i.mealType === 'breakfast' ? 'Sáng' : i.mealType === 'lunch' ? 'Trưa' : 'Tối'}): ${i.recipe ? i.recipe.name : 'Chưa lên món'}`).join('\n') +
            `\n\nTổng lượng calo tiêu thụ cả tuần khoảng **${res.totalCalories} kcal** (Trung bình **${res.dailyAvgCalories} kcal/ngày**). Bạn có thể xem lịch ăn chi tiết ở thẻ bên dưới hoặc trang Thực đơn nhé!`;
        }
      }
    } else if (text.includes('gợi ý') || text.includes('ăn gì') || text.includes('nấu gì')) {
      const currentWeekStart = this.getMondayString(new Date());
      const currentPlan = await this.actionHandler.mealPlanService.findByWeek(userId, currentWeekStart);
      const excludeIds = currentPlan?.items?.filter((i: any) => i.recipe).map((i: any) => i.recipe.id) || [];
      
      actionTaken = { name: 'get_recommendations', args: { mealType: requestedMealType, limit: 3, useAntiWaste: true, excludeIds } };
      const res = await this.actionHandler.handleAction('get_recommendations', actionTaken.args, userId);
      actionTaken.result = res;
      responseText = `Dựa trên sở thích của bạn, đây là 3 món ăn gợi ý từ MealAI:\n` +
        res.recommendations.map((r: any) => `- **${r.recipe.name}** (${r.recipe.calories} kcal, nấu trong ${r.recipe.cookingTime} phút)`).join('\n') +
        `\n\nBạn có muốn tôi giúp lên thực đơn cả tuần không?`;
    } else if (text.includes('tủ lạnh') || text.includes('nguyên liệu') || text.includes('inventory')) {
      actionTaken = { name: 'get_inventory', args: {} };
      const res = await this.actionHandler.handleAction('get_inventory', {}, userId);
      actionTaken.result = res;
      if (res.data?.length === 0) {
        responseText = `Tủ lạnh của bạn hiện tại đang trống rỗng! Hãy thêm nguyên liệu mới hoặc tạo danh sách mua sắm nhé.`;
      } else {
        responseText = `Trong tủ lạnh của bạn đang có:\n` +
          res.data.slice(0, 5).map((i: any) => `- **${i.ingredient.name}**: ${i.quantity} ${i.unit} (Hạn dùng: ${i.expirationDate ? new Date(i.expirationDate).toLocaleDateString('vi-VN') : 'Không hạn'})`).join('\n') +
          (res.data.length > 5 ? `\n... và ${res.data.length - 5} nguyên liệu khác.` : '') +
          `\n\nChỉ số tủ lạnh: ${res.summary.critical} nguyên liệu cực kỳ khẩn cấp.`;
      }
    } else if (text.includes('mua sắm') || text.includes('đi chợ') || text.includes('mua đồ')) {
      const currentWeekStart = this.actionHandler.getMondayString(new Date());
      const shoppingWeekStart = dateSelections[0]?.weekStart || currentWeekStart;
      const plan = await this.actionHandler.mealPlanService.findByWeek(userId, shoppingWeekStart);
      if (!plan) {
        responseText = `⚠️ Bạn chưa có thực đơn cho tuần cần mua sắm nên tôi chưa thể lập danh sách. Hãy gõ **"tạo thực đơn hôm nay"** hoặc chọn ngày tương lai trước nhé!`;
      } else {
        const parsedDays = dateSelections
          .filter((selection) => selection.weekStart === shoppingWeekStart)
          .map((selection) => selection.dayOfWeek);

        actionTaken = { name: 'generate_shopping_list', args: { mealPlanId: plan.id, days: parsedDays.length > 0 ? parsedDays : undefined } };
        const res = await this.actionHandler.handleAction('generate_shopping_list', actionTaken.args, userId);
        actionTaken.result = res;
        
        if (res.error) {
          responseText = `Không thể lập danh sách mua sắm: ${res.error}`;
        } else if (res.toBuy.length === 0) {
          responseText = `🎉 Tuyệt vời! Tất cả nguyên liệu cần thiết cho thực đơn của các ngày được chọn đã có đầy đủ trong tủ lạnh của bạn! Bạn không cần mua thêm gì cả.`;
        } else {
          responseText = `🛒 **Đã tự động lập danh sách mua sắm thành công!**\n` +
            `**Tên danh sách:** ${res.name}\n` +
            `**Số lượng mặt hàng cần mua:** ${res.totalItems} món\n` +
            `**Tổng chi phí dự kiến:** ${res.estimatedTotal.toLocaleString('vi-VN')} đ\n\n` +
            `**Chi tiết nguyên liệu cần mua:**\n` +
            res.toBuy.map((item: any) => `- **${item.name}**: ${item.quantity} ${item.unit} (${item.category}) - Dự tính: ${item.estimatedPrice.toLocaleString('vi-VN')}đ`).join('\n') +
            `\n\n*Hệ thống đã tự động đối chiếu với tủ lạnh và lược bỏ ${res.alreadyHave.length} nguyên liệu bạn đã có sẵn!*`;
        }
      }
    } else if (
      text.includes('thêm món') ||
      text.includes('thêm vào thực đơn') ||
      (text.includes('thêm') && text.includes('thực đơn')) ||
      text.includes('lên món') ||
      text.includes('chọn món')
    ) {
      const target = dateSelections[0] || {
        date: new Date(),
        weekStart: this.actionHandler.getMondayString(new Date()),
        dayOfWeek: this.getMealPlanDay(new Date()),
        label: 'hôm nay',
      };
      const day = target.dayOfWeek;
      const mealType = requestedMealType;
      const query = this.cleanRecipeQuery(text);

      if (!query) {
        responseText = `Bạn muốn tôi thêm món ăn gì vào thực đơn? Hãy gõ ví dụ: **"Thêm món phở bò vào bữa sáng ngày mai"** nhé!`;
      } else {
        const searchRes = await this.actionHandler.handleAction('search_recipes', { search: query, limit: 1 }, userId);
        if (!searchRes.data || searchRes.data.length === 0) {
          responseText = `Tôi không tìm thấy món ăn nào khớp với tên **"${query}"** trong hệ thống. Hãy thử tìm từ khác xem sao nhé!`;
        } else {
          const recipe = searchRes.data[0];
          const shouldOverwrite = text.includes('đổi') || text.includes('thay');
          actionTaken = {
            name: 'add_to_meal_plan',
            args: { recipeId: recipe.id, dayOfWeek: day, mealType, weekStart: target.weekStart, overwrite: shouldOverwrite }
          };
          const res = await this.actionHandler.handleAction('add_to_meal_plan', actionTaken.args, userId);
          actionTaken.result = res;
          if (res.skipped) {
            responseText = `⚠️ **Không thể ghi đè:** ${res.message}`;
          } else if (res.error) {
            responseText = `Không thể thêm món ăn: ${res.error}`;
          } else {
            const mealLabel = mealType === 'breakfast' ? 'Sáng' : mealType === 'lunch' ? 'Trưa' : mealType === 'dinner' ? 'Tối' : 'Phụ';
            responseText = `🎉 **Thành công!** Tôi đã tự động lên món **"${recipe.name}"** vào **Bữa ${mealLabel} - ${target.label}** trong thực đơn của bạn.`;
          }
        }
      }
    } else if (
      text.includes('xóa') ||
      text.includes('hủy') ||
      text.includes('bỏ') ||
      text.includes('delete') ||
      text.includes('remove')
    ) {
      const isDeletePlanKeyword = text.includes('tuần') || text.includes('cả tuần') || text.includes('hết thực đơn') || text.includes('tất cả thực đơn') || text.includes('meal plan') || text.includes('toàn bộ thực đơn');
      
      if (isDeletePlanKeyword && dateSelections.length === 0 && !text.includes('sáng') && !text.includes('trưa') && !text.includes('tối')) {
        const currentWeekStart = this.actionHandler.getMondayString(new Date());
        actionTaken = { name: 'delete_meal_plan', args: { weekStart: currentWeekStart } };
        const res = await this.actionHandler.handleAction('delete_meal_plan', actionTaken.args, userId);
        actionTaken.result = res;
        responseText = res.message || 'Đã xóa thực đơn tuần thành công!';
      } else {
        const target = dateSelections[0] || {
          date: new Date(),
          weekStart: this.actionHandler.getMondayString(new Date()),
          dayOfWeek: this.getMealPlanDay(new Date()),
          label: 'hôm nay',
        };
        const mealType = requestedMealType;
        const mealLabel = mealType === 'breakfast' ? 'sáng' : mealType === 'lunch' ? 'trưa' : mealType === 'dinner' ? 'tối' : 'phụ';
        const dayLabelsMap = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
        const dayLabel = dayLabelsMap[target.dayOfWeek];
        const dateStr = target.date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Check if user specified a recipe to delete
        let recipeQuery = text;
        const deleteWords = [/xóa/gi, /hủy/gi, /bỏ/gi, /delete/gi, /remove/gi, /đi/gi, /món/gi, /bữa/gi, /buổi/gi, /sáng/gi, /trưa/gi, /tối/gi, /phụ/gi, /hôm nay/gi, /ngày mai/gi, /ngày kia/gi, /mốt/gi];
        for (const word of deleteWords) {
          recipeQuery = recipeQuery.replace(word, '');
        }
        recipeQuery = recipeQuery.trim();

        if (recipeQuery.length > 2) {
          const plan = await this.actionHandler.mealPlanService.findByWeek(userId, target.weekStart);
          const matchedItem = plan?.items?.find(
            (item: any) => item.recipe && item.recipe.name.toLowerCase().includes(recipeQuery.toLowerCase())
          );

          if (matchedItem) {
            const itemMealLabel = matchedItem.mealType === 'breakfast' ? 'sáng' : matchedItem.mealType === 'lunch' ? 'trưa' : matchedItem.mealType === 'dinner' ? 'tối' : 'phụ';
            const itemDayLabel = dayLabelsMap[matchedItem.dayOfWeek];
            const itemDate = this.parseDateInput(target.weekStart);
            itemDate.setDate(itemDate.getDate() + matchedItem.dayOfWeek - 1);
            const itemDateStr = itemDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

            responseText = `Bạn muốn tôi xóa món **${matchedItem.recipe.name}** trong bữa ${itemMealLabel} ${itemDayLabel} (${itemDateStr}) phải không?`;
            actionTaken = {
              name: 'remove_from_meal_plan',
              args: {
                weekStart: target.weekStart,
                dayOfWeek: matchedItem.dayOfWeek,
                mealType: matchedItem.mealType,
                recipeId: matchedItem.recipe.id
              }
            };
          } else {
            responseText = `Tôi không tìm thấy món ăn nào có tên giống **"${recipeQuery}"** trong thực đơn tuần này để xóa.`;
          }
        } else {
          responseText = `Bạn muốn tôi xóa toàn bộ các món ăn trong bữa ${mealLabel} ${target.label} (${dayLabel}, ${dateStr}) phải không?`;
          actionTaken = {
            name: 'remove_from_meal_plan',
            args: {
              weekStart: target.weekStart,
              dayOfWeek: target.dayOfWeek,
              mealType: mealType
            }
          };
        }
      }
    } else if (
      (
        text.includes('thực đơn') ||
        text.includes('meal plan') ||
        text.includes('lên thực đơn') ||
        text.includes('tạo thực đơn') ||
        text.includes('đổi ngày') ||
        text.includes('đổi thực đơn') ||
        text.includes('thay đổi')
      ) &&
      dateSelections.length > 0
    ) {
      const groupedSelections = dateSelections.reduce((groups, selection) => {
        const current = groups.get(selection.weekStart) || [];
        current.push(selection);
        groups.set(selection.weekStart, current);
        return groups;
      }, new Map<string, typeof dateSelections>());

      const hasBreakfast = text.includes('sáng') || text.includes('breakfast');
      const hasLunch = text.includes('trưa') || text.includes('lunch');
      const hasDinner = text.includes('tối') || text.includes('dinner');
      const hasSnack = text.includes('phụ') || text.includes('snack');
      
      const specificMealType = (hasBreakfast && !hasLunch && !hasDinner && !hasSnack) ? 'breakfast' :
                               (!hasBreakfast && hasLunch && !hasDinner && !hasSnack) ? 'lunch' :
                               (!hasBreakfast && !hasLunch && hasDinner && !hasSnack) ? 'dinner' :
                               (!hasBreakfast && !hasLunch && !hasDinner && hasSnack) ? 'snack' :
                               undefined;

      if (groupedSelections.size === 0) {
        responseText = `Bạn muốn tôi tạo thực đơn cho ngày nào cụ thể? Hãy gõ ví dụ: **"Tạo thực đơn cho ngày mai"** nhé!`;
      } else {
        const results: any[] = [];
        const firstWeekStart = dateSelections[0]?.weekStart || this.actionHandler.getMondayString(new Date());
        const beforePlan = await this.actionHandler.mealPlanService.findByWeek(userId, firstWeekStart);
        const shouldOverwrite = text.includes('đổi') || text.includes('thay');

        for (const [weekStart, selections] of groupedSelections.entries()) {
          const mealDates = selections.map((selection) => this.formatDateInput(selection.date));
          const res = await this.actionHandler.handleAction(
            'generate_meal_plan_for_days',
            { weekStart, mealDates, useAntiWaste: true, mealType: specificMealType, userRequest: content, overwrite: shouldOverwrite },
            userId
          );
          results.push({ weekStart, mealDates, labels: selections.map((selection) => selection.label), result: res });
        }
        const firstResult = results[0];
        actionTaken = {
          name: 'generate_meal_plan_for_days',
          args: { weekStart: firstResult.weekStart, mealDates: firstResult.mealDates, useAntiWaste: true, mealType: specificMealType, userRequest: content, overwrite: shouldOverwrite },
          result: firstResult.result,
        };
        
        const dayNames = results.flatMap((item) => item.labels).join(', ');
        if (results.some((item) => item.result?.error)) {
          responseText = `Không thể tạo thực đơn cho một số ngày: ${results.find((item) => item.result?.error)?.result?.error}`;
        } else {
          const mealNamesMap: Record<string, string> = { breakfast: 'Bữa sáng', lunch: 'Bữa trưa', dinner: 'Bữa tối', snack: 'Bữa phụ' };
          const keptMeals = new Set<string>();
          const addedMeals = new Set<string>();

          const allMealDates = results.flatMap((item) => item.mealDates);
          const afterPlan = results[0]?.result;

          if (afterPlan && afterPlan.items) {
            for (const mDate of allMealDates) {
              const dateItemsBefore = (beforePlan?.items || []).filter((item: any) => item.mealDate === mDate);
              const dateItemsAfter = (afterPlan.items || []).filter((item: any) => item.mealDate === mDate);

              for (const mealType of ['breakfast', 'lunch', 'dinner']) {
                if (specificMealType && mealType !== specificMealType) continue;

                const beforeItem = dateItemsBefore.find((i: any) => i.mealType === mealType && i.recipe);
                const afterItem = dateItemsAfter.find((i: any) => i.mealType === mealType && i.recipe);

                if (beforeItem && afterItem && beforeItem.recipe.id === afterItem.recipe.id) {
                  keptMeals.add(`✓ ${mealNamesMap[mealType]}`);
                } else if (!beforeItem && afterItem) {
                  addedMeals.add(`✓ ${mealNamesMap[mealType]}`);
                }
              }
            }
          }

          responseText = `🎉 **Thành công!** Tôi đã tự động lên thực đơn cho các ngày: ${dayNames}.\n\n`;
          if (keptMeals.size > 0) {
            responseText += `Đã giữ nguyên:\n${Array.from(keptMeals).map(m => `- ${m}`).join('\n')}\n\n`;
          }
          if (addedMeals.size > 0) {
            responseText += `Đã thêm:\n${Array.from(addedMeals).map(m => `- ${m}`).join('\n')}\n\n`;
          }
          responseText += `Không có món nào bị thay thế. Bạn có thể xem chi tiết ở trang Lịch Ăn nhé! 📅`;
        }
      }
    } else if (text.includes('calo') || text.includes('tdee') || text.includes('cơ thể')) {
      actionTaken = { name: 'calculate_calories', args: {} };
      const res = await this.actionHandler.handleAction('calculate_calories', {}, userId);
      actionTaken.result = res;
      responseText = res.message || 'Không thể tính toán calo';
    } else if (text.includes('thực đơn') || text.includes('meal plan')) {
      actionTaken = { name: 'get_meal_plan', args: {} };
      const res = await this.actionHandler.handleAction('get_meal_plan', {}, userId);
      actionTaken.result = res;
      if (res.message) {
        responseText = res.message;
      } else {
        responseText = `Thực đơn tuần này của bạn:\n` +
          res.items.slice(0, 6).map((i: any) => `- **${i.dayLabel}** (${i.mealType === 'breakfast' ? 'Sáng' : i.mealType === 'lunch' ? 'Trưa' : 'Tối'}): ${i.recipe ? i.recipe.name : 'Chưa lên món'}`).join('\n') +
          `\n\nTổng calo cả tuần: ${res.totalCalories} kcal.`;
      }
    } else {
      responseText =
        `🤖 **Xin chào! Tôi là MealAI Assistant.** Dưới đây là các lệnh tôi hiểu:\n\n` +
        `🗓️ **Thực đơn:**\n` +
        `- "Tạo thực đơn cho hôm nay" — tạo thực đơn một ngày\n` +
        `- "Tạo cả 3 bữa hôm nay" — đặt đủ sáng, trưa, tối\n` +
        `- "Tạo thực đơn cả tuần" — lập kế hoạch tuần\n` +
        `- "Xem thực đơn" — hiển thị lịch ăn hiện tại\n\n` +
        `🍲 **Món ăn:**\n` +
        `- "Gợi ý bữa trưa" / "Gợi ý sáng nay" — nhận gợi ý món ăn\n` +
        `- "Thêm vài món vô" / "Thêm nữa" — tự động điền các bữa còn trống\n` +
        `- "sáng" / "trưa" / "tối" — thêm món AI gợi ý vào bữa đó hôm nay\n` +
        `- "Món ăn lành mạnh" / "Healthy" / "ít calo" — gợi ý < 400 kcal\n` +
        `- "Thêm món [tên món] bữa sáng" — thêm món cụ thể\n\n` +
        `🧀 **Nguyên liệu & Mua sắm:**\n` +
        `- "Tủ lạnh còn gì" — kiểm tra kho nguyên liệu\n` +
        `- "Lập danh sách đi chợ" / "Mua sắm" — tạo shopping list\n\n` +
        `⚖️ **Sức khỏe:**\n` +
        `- "Tính calo / TDEE" — tính nhu cầu năng lượng hàng ngày`;
    }

    const assistantMsg = this.chatMessageRepo.create({
      userId,
      role: 'model',
      content: responseText,
      metadata: actionTaken ? { action: actionTaken.name, result: actionTaken.result, args: actionTaken.args } : null,
    });
    await this.chatMessageRepo.save(assistantMsg);

    return { text: responseText, actionTaken };
  }

  private parseMealTypeFromText(text: string): string {
    if (text.includes('sáng') || text.includes('breakfast')) return 'breakfast';
    if (text.includes('tối') || text.includes('dinner')) return 'dinner';
    if (text.includes('phụ') || text.includes('snack')) return 'snack';
    return 'lunch';
  }

  private parseDateSelections(text: string): Array<{ date: Date; weekStart: string; dayOfWeek: number; label: string }> {
    const selections: Array<{ date: Date; weekStart: string; dayOfWeek: number; label: string }> = [];
    const addSelection = (date: Date, label: string) => {
      const value = this.formatDateInput(date);
      if (selections.some((item) => this.formatDateInput(item.date) === value)) return;
      selections.push({
        date,
        weekStart: this.getMondayString(date),
        dayOfWeek: this.getMealPlanDay(date),
        label,
      });
    };

    // Parse concrete date like DD/MM/YYYY or DD-MM-YYYY
    const concreteDateMatch = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(text);
    if (concreteDateMatch) {
      const day = Number(concreteDateMatch[1]);
      const month = Number(concreteDateMatch[2]) - 1;
      const year = Number(concreteDateMatch[3]);
      const parsedDate = new Date(year, month, day);
      if (!isNaN(parsedDate.getTime())) {
        addSelection(parsedDate, `ngày ${concreteDateMatch[1]}-${concreteDateMatch[2]}-${concreteDateMatch[3]}`);
      }
    }

    const today = this.dateOnly(new Date());
    if (text.includes('hôm nay') || /\bnay\b/.test(text)) {
      addSelection(today, 'hôm nay');
    }
    if (text.includes('ngày mai') || /\bmai\b/.test(text)) {
      const tomorrow = this.addDays(today, 1);
      addSelection(tomorrow, 'ngày mai');
    }
    if (text.includes('ngày kia') || text.includes('mốt')) {
      const nextTwoDays = this.addDays(today, 2);
      addSelection(nextTwoDays, 'ngày kia');
    }

    const weekdays = [
      { day: 1, label: 'Thứ Hai', patterns: ['thứ hai', 'thứ 2', 't2'] },
      { day: 2, label: 'Thứ Ba', patterns: ['thứ ba', 'thứ 3', 't3'] },
      { day: 3, label: 'Thứ Tư', patterns: ['thứ tư', 'thứ 4', 't4'] },
      { day: 4, label: 'Thứ Năm', patterns: ['thứ năm', 'thứ 5', 't5'] },
      { day: 5, label: 'Thứ Sáu', patterns: ['thứ sáu', 'thứ 6', 't6'] },
      { day: 6, label: 'Thứ Bảy', patterns: ['thứ bảy', 'thứ 7', 't7'] },
      { day: 7, label: 'Chủ Nhật', patterns: ['chủ nhật', 'cn'] },
    ];
    const forceNextWeek = text.includes('tuần sau');
    const currentWeekStart = this.parseDateInput(this.getMondayString(today));

    for (const weekday of weekdays) {
      if (!weekday.patterns.some((pattern) => text.includes(pattern))) continue;

      let date = this.addDays(currentWeekStart, weekday.day - 1);
      if (date < today || forceNextWeek) {
        date = this.addDays(date, 7);
      }
      addSelection(date, forceNextWeek ? `${weekday.label} tuần sau` : weekday.label);
    }

    return selections.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private cleanRecipeQuery(text: string): string {
    return text
      .replace(/thêm món/gi, '')
      .replace(/thêm vào thực đơn/gi, '')
      .replace(/lên món/gi, '')
      .replace(/chọn món/gi, '')
      .replace(/thêm/gi, '')
      .replace(/vào/gi, '')
      .replace(/thực đơn/gi, '')
      .replace(/bữa/gi, '')
      .replace(/sáng|trưa|tối|phụ/gi, '')
      .replace(/hôm nay|ngày mai|ngày kia|tuần sau|mai|mốt/gi, '')
      .replace(/thứ\s+\w+/gi, '')
      .replace(/thứ\s+\d+/gi, '')
      .replace(/chủ nhật/gi, '')
      .replace(/\bt\d+\b/gi, '')
      .replace(/\bcn\b/gi, '')
      .replace(/cho/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getMealPlanDay(date: Date): number {
    const day = date.getDay();
    return day === 0 ? 7 : day;
  }

  private getMondayString(d: Date): string {
    const target = this.dateOnly(d);
    const day = target.getDay();
    const diff = target.getDate() - day + (day === 0 ? -6 : 1);
    target.setDate(diff);
    return this.formatDateInput(target);
  }

  private addDays(date: Date, days: number): Date {
    const next = this.dateOnly(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private parseDateInput(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return this.dateOnly(new Date(value));
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  private dateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async sendVoiceMessage(userId: string, content: string, durationMs: number): Promise<{ text: string; actionTaken?: any }> {
    // 1. Process as regular chatbot message (using sendMessage)
    const result = await this.sendMessage(userId, content);

    // 2. Check if action succeeded
    let isSuccess = true;
    let intent: string | null = null;
    if (result.actionTaken) {
      intent = result.actionTaken.name;
      const resVal = result.actionTaken.result;
      if (resVal && (resVal.error || resVal.skipped === true || resVal.success === false)) {
        isSuccess = false;
      }
    }

    // 3. Log the voice command to database
    try {
      const log = this.voiceLogRepo.create({
        userId,
        commandText: content,
        responseText: result.text,
        intent,
        isSuccess,
        durationMs,
      });
      await this.voiceLogRepo.save(log);
    } catch (err: any) {
      this.logger.error('Failed to log voice command: ' + err.message);
    }

    return result;
  }

  async getVoiceStats() {
    // 1. Total voice commands
    const totalCommands = await this.voiceLogRepo.count();

    // 2. Most used intents (group by intent, count)
    const intentStats = await this.voiceLogRepo
      .createQueryBuilder('log')
      .select('log.intent', 'intent')
      .addSelect('COUNT(log.id)', 'count')
      .where('log.intent IS NOT NULL')
      .groupBy('log.intent')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();

    // 3. Success rate
    const successCount = await this.voiceLogRepo.count({ where: { isSuccess: true } });
    const successRate = totalCommands > 0 ? (successCount / totalCommands) * 100 : 100;

    // 4. Top users using voice
    const topUsers = await this.voiceLogRepo
      .createQueryBuilder('log')
      .select('log.userId', 'userId')
      .addSelect('COUNT(log.id)', 'count')
      .addSelect('user.fullName', 'fullName')
      .addSelect('user.email', 'email')
      .innerJoin(User, 'user', 'user.id = log.userId')
      .groupBy('log.userId')
      .addGroupBy('user.fullName')
      .addGroupBy('user.email')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalCommands,
      intentStats,
      successRate: Math.round(successRate * 100) / 100, // Round to 2 decimals
      topUsers,
    };
  }
}
