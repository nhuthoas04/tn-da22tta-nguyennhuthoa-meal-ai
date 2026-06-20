import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ingredient } from '../recipes/entities/ingredient.entity';
import { Recipe } from '../recipes/entities/recipe.entity';
import { RecipeIngredient } from '../recipes/entities/recipe-ingredient.entity';
import { User } from '../auth/entities/user.entity';
import * as bcrypt from 'bcryptjs';

/**
 * Seed Service: Populates the database with Vietnamese recipe data
 * Only runs if the database is empty (first startup)
 */
@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(Ingredient)
    private ingredientRepo: Repository<Ingredient>,
    @InjectRepository(Recipe) private recipeRepo: Repository<Recipe>,
    @InjectRepository(RecipeIngredient)
    private riRepo: Repository<RecipeIngredient>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();

    const count = await this.ingredientRepo.count();
    if (count > 0) {
      await this.updateExistingRecipesNutrition();
      return; // Already seeded
    }

    console.log('🌱 Seeding database with Vietnamese recipe data...');
    await this.seedIngredients();
    await this.seedRecipes();
    console.log('✅ Seed complete!');
  }

  private async seedAdmin() {
    const existing = await this.userRepo.findOne({
      where: { email: 'admin@mealai.vn' },
    });
    if (existing) {
      // Ensure the existing account has admin role
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        await this.userRepo.save(existing);
        console.log('🔑 Updated admin@mealai.vn role to admin');
      }
      return;
    }

    const passwordHash = await bcrypt.hash('admin123456', 10);
    const admin = this.userRepo.create({
      email: 'admin@mealai.vn',
      passwordHash,
      fullName: 'Admin',
      role: 'admin',
    });
    await this.userRepo.save(admin);
    console.log('👑 Admin account created: admin@mealai.vn / admin123456');
  }

  private async seedIngredients() {
    const ingredients = [
      // === Thịt (Meat) ===
      {
        name: 'Thịt heo',
        category: 'thit',
        defaultUnit: 'g',
        caloriesPer100g: 242,
        proteinPer100g: 27,
        carbsPer100g: 0,
        fatPer100g: 14,
      },
      {
        name: 'Thịt bò',
        category: 'thit',
        defaultUnit: 'g',
        caloriesPer100g: 250,
        proteinPer100g: 26,
        carbsPer100g: 0,
        fatPer100g: 15,
      },
      {
        name: 'Thịt gà',
        category: 'thit',
        defaultUnit: 'g',
        caloriesPer100g: 239,
        proteinPer100g: 27,
        carbsPer100g: 0,
        fatPer100g: 14,
      },
      {
        name: 'Sườn heo',
        category: 'thit',
        defaultUnit: 'g',
        caloriesPer100g: 277,
        proteinPer100g: 24,
        carbsPer100g: 0,
        fatPer100g: 20,
      },

      // === Hải sản (Seafood) ===
      {
        name: 'Cá lóc',
        category: 'hai_san',
        defaultUnit: 'g',
        caloriesPer100g: 90,
        proteinPer100g: 18,
        carbsPer100g: 0,
        fatPer100g: 2,
      },
      {
        name: 'Tôm',
        category: 'hai_san',
        defaultUnit: 'g',
        caloriesPer100g: 85,
        proteinPer100g: 20,
        carbsPer100g: 0,
        fatPer100g: 1,
      },
      {
        name: 'Cá thu',
        category: 'hai_san',
        defaultUnit: 'g',
        caloriesPer100g: 205,
        proteinPer100g: 19,
        carbsPer100g: 0,
        fatPer100g: 14,
      },

      // === Rau củ (Vegetables) ===
      {
        name: 'Rau muống',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 19,
        proteinPer100g: 2.6,
        carbsPer100g: 3.1,
        fatPer100g: 0.2,
      },
      {
        name: 'Cà chua',
        category: 'rau_cu',
        defaultUnit: 'quả',
        caloriesPer100g: 18,
        proteinPer100g: 0.9,
        carbsPer100g: 3.9,
        fatPer100g: 0.2,
      },
      {
        name: 'Hành tây',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 40,
        proteinPer100g: 1.1,
        carbsPer100g: 9.3,
        fatPer100g: 0.1,
      },
      {
        name: 'Bắp cải',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 25,
        proteinPer100g: 1.3,
        carbsPer100g: 5.8,
        fatPer100g: 0.1,
      },
      {
        name: 'Cà rốt',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 41,
        proteinPer100g: 0.9,
        carbsPer100g: 9.6,
        fatPer100g: 0.2,
      },
      {
        name: 'Giá đỗ',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 31,
        proteinPer100g: 3.0,
        carbsPer100g: 5.9,
        fatPer100g: 0.2,
      },
      {
        name: 'Rau cải',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 13,
        proteinPer100g: 1.5,
        carbsPer100g: 2.2,
        fatPer100g: 0.2,
      },
      {
        name: 'Khổ qua',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 17,
        proteinPer100g: 1.0,
        carbsPer100g: 3.7,
        fatPer100g: 0.2,
      },
      {
        name: 'Bí đao',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 12,
        proteinPer100g: 0.4,
        carbsPer100g: 3.0,
        fatPer100g: 0.2,
      },
      {
        name: 'Đậu que',
        category: 'rau_cu',
        defaultUnit: 'g',
        caloriesPer100g: 31,
        proteinPer100g: 1.8,
        carbsPer100g: 7.0,
        fatPer100g: 0.1,
      },

      // === Gia vị (Spices) ===
      {
        name: 'Tỏi',
        category: 'gia_vi',
        defaultUnit: 'tép',
        caloriesPer100g: 149,
        proteinPer100g: 6.4,
        carbsPer100g: 33,
        fatPer100g: 0.5,
      },
      {
        name: 'Nước mắm',
        category: 'gia_vi',
        defaultUnit: 'ml',
        caloriesPer100g: 35,
        proteinPer100g: 5,
        carbsPer100g: 3,
        fatPer100g: 0,
      },
      {
        name: 'Đường',
        category: 'gia_vi',
        defaultUnit: 'g',
        caloriesPer100g: 387,
        proteinPer100g: 0,
        carbsPer100g: 100,
        fatPer100g: 0,
      },
      {
        name: 'Dầu ăn',
        category: 'gia_vi',
        defaultUnit: 'ml',
        caloriesPer100g: 884,
        proteinPer100g: 0,
        carbsPer100g: 0,
        fatPer100g: 100,
      },
      {
        name: 'Hành lá',
        category: 'gia_vi',
        defaultUnit: 'g',
        caloriesPer100g: 32,
        proteinPer100g: 1.8,
        carbsPer100g: 7.3,
        fatPer100g: 0.2,
      },
      {
        name: 'Ớt',
        category: 'gia_vi',
        defaultUnit: 'quả',
        caloriesPer100g: 40,
        proteinPer100g: 1.9,
        carbsPer100g: 8.8,
        fatPer100g: 0.4,
      },
      {
        name: 'Me',
        category: 'gia_vi',
        defaultUnit: 'g',
        caloriesPer100g: 239,
        proteinPer100g: 2.8,
        carbsPer100g: 62.5,
        fatPer100g: 0.6,
      },
      {
        name: 'Sả',
        category: 'gia_vi',
        defaultUnit: 'cây',
        caloriesPer100g: 99,
        proteinPer100g: 1.8,
        carbsPer100g: 25.3,
        fatPer100g: 0.5,
      },

      // === Khác (Other) ===
      {
        name: 'Gạo',
        category: 'khac',
        defaultUnit: 'g',
        caloriesPer100g: 130,
        proteinPer100g: 2.7,
        carbsPer100g: 28,
        fatPer100g: 0.3,
      },
      {
        name: 'Trứng gà',
        category: 'khac',
        defaultUnit: 'quả',
        caloriesPer100g: 155,
        proteinPer100g: 13,
        carbsPer100g: 1.1,
        fatPer100g: 11,
      },
      {
        name: 'Bún',
        category: 'khac',
        defaultUnit: 'g',
        caloriesPer100g: 110,
        proteinPer100g: 3.4,
        carbsPer100g: 25,
        fatPer100g: 0.1,
      },
      {
        name: 'Đậu phụ',
        category: 'khac',
        defaultUnit: 'miếng',
        caloriesPer100g: 76,
        proteinPer100g: 8,
        carbsPer100g: 1.9,
        fatPer100g: 4.8,
      },
      {
        name: 'Phở',
        category: 'khac',
        defaultUnit: 'g',
        caloriesPer100g: 109,
        proteinPer100g: 3.3,
        carbsPer100g: 24,
        fatPer100g: 0.2,
      },
      {
        name: 'Bánh mì',
        category: 'khac',
        defaultUnit: 'ổ',
        caloriesPer100g: 265,
        proteinPer100g: 9,
        carbsPer100g: 49,
        fatPer100g: 3.2,
      },
      {
        name: 'Nước cốt dừa',
        category: 'khac',
        defaultUnit: 'ml',
        caloriesPer100g: 230,
        proteinPer100g: 2.3,
        carbsPer100g: 5.5,
        fatPer100g: 23.8,
      },
    ];

    const saved = await this.ingredientRepo.save(
      ingredients.map((i) => this.ingredientRepo.create(i)),
    );

    // Create a lookup map for recipe seeding
    this.ingredientMap = new Map(saved.map((i) => [i.name, i.id]));
  }

  private ingredientMap: Map<string, string> = new Map();

  private async seedRecipes() {
    const recipes = [
      // ========== BREAKFAST ==========
      {
        name: 'Bánh mì trứng ốp la',
        description:
          'Bánh mì giòn kẹp trứng ốp la, đơn giản cho bữa sáng nhanh',
        cookingTime: 10,
        servings: 1,
        difficulty: 'easy',
        calories: 380,
        protein: 15,
        carbs: 40,
        fat: 18,
        tags: ['nhanh', 'sáng'],
        mealType: ['breakfast'],
        cuisineRegion: null,
        estimatedCost: 15000,
        steps: [
          { step: 1, description: 'Chiên trứng ốp la với ít dầu' },
          { step: 2, description: 'Nướng bánh mì giòn' },
          {
            step: 3,
            description: 'Kẹp trứng vào bánh mì, thêm chút nước tương',
          },
        ],
        ingredients: [
          { name: 'Trứng gà', quantity: 2, unit: 'quả' },
          { name: 'Bánh mì', quantity: 1, unit: 'ổ' },
          { name: 'Dầu ăn', quantity: 5, unit: 'ml' },
        ],
      },
      {
        name: 'Phở bò',
        description: 'Phở bò truyền thống Hà Nội với nước dùng xương hầm',
        cookingTime: 60,
        servings: 4,
        difficulty: 'hard',
        calories: 480,
        protein: 28,
        carbs: 55,
        fat: 12,
        tags: ['miền Bắc', 'truyền thống'],
        mealType: ['breakfast', 'lunch'],
        cuisineRegion: 'miền Bắc',
        estimatedCost: 40000,
        steps: [
          { step: 1, description: 'Hầm xương bò 4 tiếng với gừng, hành nướng' },
          { step: 2, description: 'Lọc nước dùng, nêm nước mắm, đường' },
          { step: 3, description: 'Trụng phở, xếp thịt bò thái mỏng lên trên' },
          { step: 4, description: 'Chan nước dùng nóng, ăn kèm rau thơm, giá' },
        ],
        ingredients: [
          { name: 'Thịt bò', quantity: 300, unit: 'g' },
          { name: 'Phở', quantity: 400, unit: 'g' },
          { name: 'Hành tây', quantity: 100, unit: 'g' },
          { name: 'Giá đỗ', quantity: 100, unit: 'g' },
          { name: 'Nước mắm', quantity: 30, unit: 'ml' },
        ],
      },
      {
        name: 'Cháo gà',
        description: 'Cháo gà nóng hổi, bổ dưỡng, thích hợp cho bữa sáng nhẹ',
        cookingTime: 40,
        servings: 4,
        difficulty: 'easy',
        calories: 350,
        protein: 20,
        carbs: 45,
        fat: 8,
        tags: ['nhẹ', 'dễ tiêu', 'bổ dưỡng'],
        mealType: ['breakfast', 'dinner'],
        cuisineRegion: null,
        estimatedCost: 30000,
        steps: [
          { step: 1, description: 'Luộc gà nguyên con với gừng 30 phút' },
          {
            step: 2,
            description: 'Vớt gà ra xé nhỏ, nấu cháo với nước luộc gà',
          },
          {
            step: 3,
            description: 'Khi cháo nhuyễn, cho thịt gà vào, nêm gia vị',
          },
          { step: 4, description: 'Múc ra tô, rắc hành lá, tiêu, ăn nóng' },
        ],
        ingredients: [
          { name: 'Thịt gà', quantity: 500, unit: 'g' },
          { name: 'Gạo', quantity: 200, unit: 'g' },
          { name: 'Hành lá', quantity: 20, unit: 'g' },
          { name: 'Nước mắm', quantity: 15, unit: 'ml' },
        ],
      },
      {
        name: 'Bún bò Huế',
        description: 'Bún bò Huế cay nồng đặc trưng miền Trung',
        cookingTime: 90,
        servings: 4,
        difficulty: 'hard',
        calories: 520,
        protein: 30,
        carbs: 50,
        fat: 18,
        tags: ['miền Trung', 'cay'],
        mealType: ['breakfast', 'lunch'],
        cuisineRegion: 'miền Trung',
        estimatedCost: 45000,
        steps: [
          { step: 1, description: 'Hầm xương heo với sả, mắm ruốc 3 tiếng' },
          { step: 2, description: 'Phi sả, ớt bột tạo màu cho nước dùng' },
          { step: 3, description: 'Trụng bún, xếp thịt bò, giò heo' },
          { step: 4, description: 'Chan nước dùng, ăn kèm rau sống' },
        ],
        ingredients: [
          { name: 'Thịt bò', quantity: 300, unit: 'g' },
          { name: 'Sườn heo', quantity: 200, unit: 'g' },
          { name: 'Bún', quantity: 400, unit: 'g' },
          { name: 'Sả', quantity: 3, unit: 'cây' },
          { name: 'Ớt', quantity: 5, unit: 'quả' },
          { name: 'Nước mắm', quantity: 30, unit: 'ml' },
        ],
      },

      // ========== LUNCH / DINNER ==========
      {
        name: 'Cơm tấm sườn nướng',
        description: 'Cơm tấm Sài Gòn với sườn nướng thơm lừng',
        cookingTime: 45,
        servings: 4,
        difficulty: 'medium',
        calories: 650,
        protein: 35,
        carbs: 70,
        fat: 22,
        tags: ['miền Nam'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: 'miền Nam',
        estimatedCost: 40000,
        steps: [
          {
            step: 1,
            description: 'Ướp sườn với tỏi, sả, nước mắm, mật ong 2 tiếng',
          },
          {
            step: 2,
            description: 'Nướng sườn trên than hoa hoặc lò nướng 200°C',
          },
          { step: 3, description: 'Nấu cơm tấm, pha nước mắm chua ngọt' },
          { step: 4, description: 'Bày cơm, sườn, đồ chua, dưa leo' },
        ],
        ingredients: [
          { name: 'Sườn heo', quantity: 600, unit: 'g' },
          { name: 'Gạo', quantity: 400, unit: 'g' },
          { name: 'Tỏi', quantity: 5, unit: 'tép' },
          { name: 'Sả', quantity: 2, unit: 'cây' },
          { name: 'Nước mắm', quantity: 30, unit: 'ml' },
          { name: 'Đường', quantity: 15, unit: 'g' },
        ],
      },
      {
        name: 'Rau muống xào tỏi',
        description: 'Món rau xào đơn giản, thanh mát, giòn ngọt',
        cookingTime: 15,
        servings: 4,
        difficulty: 'easy',
        calories: 85,
        protein: 3,
        carbs: 8,
        fat: 5,
        tags: ['chay', 'nhanh', 'rau'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: 'miền Nam',
        estimatedCost: 15000,
        steps: [
          { step: 1, description: 'Rửa sạch rau muống, cắt khúc 5cm' },
          { step: 2, description: 'Phi tỏi thơm với 2 thìa dầu ăn, lửa lớn' },
          {
            step: 3,
            description: 'Cho rau muống vào xào nhanh 2 phút, nêm nước mắm',
          },
        ],
        ingredients: [
          { name: 'Rau muống', quantity: 300, unit: 'g' },
          { name: 'Tỏi', quantity: 5, unit: 'tép' },
          { name: 'Nước mắm', quantity: 15, unit: 'ml' },
          { name: 'Dầu ăn', quantity: 15, unit: 'ml' },
        ],
      },
      {
        name: 'Canh chua cá lóc',
        description: 'Canh chua miền Nam với cá lóc tươi, me, thơm',
        cookingTime: 30,
        servings: 4,
        difficulty: 'medium',
        calories: 180,
        protein: 22,
        carbs: 10,
        fat: 5,
        tags: ['miền Nam', 'canh'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: 'miền Nam',
        estimatedCost: 50000,
        steps: [
          { step: 1, description: 'Nấu nước me chua, lọc bỏ hạt' },
          { step: 2, description: 'Cho cà chua, thơm vào nấu mềm' },
          { step: 3, description: 'Thả cá lóc vào, nấu chín, nêm gia vị' },
          { step: 4, description: 'Cho giá đỗ, rau ngổ, tắt bếp' },
        ],
        ingredients: [
          { name: 'Cá lóc', quantity: 400, unit: 'g' },
          { name: 'Cà chua', quantity: 3, unit: 'quả' },
          { name: 'Giá đỗ', quantity: 100, unit: 'g' },
          { name: 'Me', quantity: 30, unit: 'g' },
          { name: 'Nước mắm', quantity: 15, unit: 'ml' },
          { name: 'Đường', quantity: 10, unit: 'g' },
        ],
      },
      {
        name: 'Đậu phụ sốt cà chua',
        description: 'Đậu phụ chiên giòn sốt cà chua đậm đà, phù hợp ăn chay',
        cookingTime: 20,
        servings: 4,
        difficulty: 'easy',
        calories: 150,
        protein: 12,
        carbs: 10,
        fat: 7,
        tags: ['chay', 'nhanh'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: null,
        estimatedCost: 15000,
        steps: [
          { step: 1, description: 'Chiên đậu phụ vàng giòn 2 mặt' },
          { step: 2, description: 'Phi tỏi, xào cà chua nhuyễn' },
          {
            step: 3,
            description: 'Cho đậu phụ vào sốt, nêm gia vị, đun 5 phút',
          },
        ],
        ingredients: [
          { name: 'Đậu phụ', quantity: 4, unit: 'miếng' },
          { name: 'Cà chua', quantity: 3, unit: 'quả' },
          { name: 'Tỏi', quantity: 3, unit: 'tép' },
          { name: 'Nước mắm', quantity: 10, unit: 'ml' },
          { name: 'Dầu ăn', quantity: 20, unit: 'ml' },
        ],
      },
      {
        name: 'Thịt kho trứng',
        description: 'Thịt heo kho trứng nước dừa kiểu miền Nam, béo ngậy',
        cookingTime: 60,
        servings: 4,
        difficulty: 'medium',
        calories: 450,
        protein: 30,
        carbs: 15,
        fat: 30,
        tags: ['miền Nam', 'truyền thống'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: 'miền Nam',
        estimatedCost: 60000,
        steps: [
          { step: 1, description: 'Cắt thịt heo thành miếng vuông, luộc sơ' },
          { step: 2, description: 'Thắng nước màu (caramel) với đường' },
          {
            step: 3,
            description: 'Rim thịt với nước dừa, nước mắm, lửa nhỏ 45 phút',
          },
          { step: 4, description: 'Cho trứng gà luộc vào kho thêm 15 phút' },
        ],
        ingredients: [
          { name: 'Thịt heo', quantity: 500, unit: 'g' },
          { name: 'Trứng gà', quantity: 4, unit: 'quả' },
          { name: 'Nước cốt dừa', quantity: 200, unit: 'ml' },
          { name: 'Nước mắm', quantity: 30, unit: 'ml' },
          { name: 'Đường', quantity: 20, unit: 'g' },
        ],
      },
      {
        name: 'Canh bí đao thịt heo',
        description: 'Canh bí đao nấu với thịt heo xay, trong mát giải nhiệt',
        cookingTime: 25,
        servings: 4,
        difficulty: 'easy',
        calories: 120,
        protein: 8,
        carbs: 12,
        fat: 4,
        tags: ['canh', 'nhẹ'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: null,
        estimatedCost: 25000,
        steps: [
          { step: 1, description: 'Gọt vỏ bí đao, cắt miếng vừa ăn' },
          { step: 2, description: 'Viên thịt heo xay, thả vào nước sôi' },
          { step: 3, description: 'Cho bí đao vào nấu mềm, nêm nước mắm' },
        ],
        ingredients: [
          { name: 'Bí đao', quantity: 300, unit: 'g' },
          { name: 'Thịt heo', quantity: 150, unit: 'g' },
          { name: 'Hành lá', quantity: 10, unit: 'g' },
          { name: 'Nước mắm', quantity: 10, unit: 'ml' },
        ],
      },
      {
        name: 'Cá thu kho',
        description: 'Cá thu kho tộ đậm đà, ăn với cơm nóng',
        cookingTime: 35,
        servings: 4,
        difficulty: 'medium',
        calories: 320,
        protein: 25,
        carbs: 8,
        fat: 20,
        tags: ['kho', 'truyền thống'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: null,
        estimatedCost: 55000,
        steps: [
          { step: 1, description: 'Cắt cá thu thành lát dày 2cm' },
          {
            step: 2,
            description: 'Ướp cá với nước mắm, đường, ớt, tỏi 15 phút',
          },
          {
            step: 3,
            description: 'Kho cá với lửa nhỏ 30 phút đến khi cạn nước',
          },
        ],
        ingredients: [
          { name: 'Cá thu', quantity: 400, unit: 'g' },
          { name: 'Nước mắm', quantity: 25, unit: 'ml' },
          { name: 'Đường', quantity: 15, unit: 'g' },
          { name: 'Tỏi', quantity: 3, unit: 'tép' },
          { name: 'Ớt', quantity: 2, unit: 'quả' },
        ],
      },
      {
        name: 'Gỏi cuốn tôm thịt',
        description: 'Gỏi cuốn tươi mát với tôm, thịt heo, rau sống',
        cookingTime: 25,
        servings: 4,
        difficulty: 'easy',
        calories: 200,
        protein: 18,
        carbs: 20,
        fat: 4,
        tags: ['miền Nam', 'nhẹ', 'healthy'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: 'miền Nam',
        estimatedCost: 40000,
        steps: [
          { step: 1, description: 'Luộc tôm và thịt heo, thái mỏng' },
          { step: 2, description: 'Nhúng bánh tráng qua nước, trải ra' },
          { step: 3, description: 'Đặt rau, bún, thịt, tôm rồi cuốn chặt' },
          { step: 4, description: 'Chấm với nước mắm pha hoặc tương đen' },
        ],
        ingredients: [
          { name: 'Tôm', quantity: 200, unit: 'g' },
          { name: 'Thịt heo', quantity: 200, unit: 'g' },
          { name: 'Bún', quantity: 200, unit: 'g' },
          { name: 'Rau cải', quantity: 100, unit: 'g' },
          { name: 'Nước mắm', quantity: 15, unit: 'ml' },
        ],
      },
      {
        name: 'Khổ qua nhồi thịt',
        description: 'Khổ qua nhồi thịt heo xay, canh thanh mát giải nhiệt',
        cookingTime: 35,
        servings: 4,
        difficulty: 'medium',
        calories: 180,
        protein: 15,
        carbs: 8,
        fat: 10,
        tags: ['canh', 'miền Nam'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: 'miền Nam',
        estimatedCost: 35000,
        steps: [
          {
            step: 1,
            description: 'Khoét ruột khổ qua, ngâm nước muối bớt đắng',
          },
          {
            step: 2,
            description: 'Trộn thịt heo xay với hành, tiêu, nước mắm',
          },
          { step: 3, description: 'Nhồi thịt vào khổ qua, nấu canh 20 phút' },
        ],
        ingredients: [
          { name: 'Khổ qua', quantity: 3, unit: 'g' },
          { name: 'Thịt heo', quantity: 200, unit: 'g' },
          { name: 'Hành lá', quantity: 10, unit: 'g' },
          { name: 'Nước mắm', quantity: 15, unit: 'ml' },
        ],
      },
      {
        name: 'Bắp cải xào trứng',
        description: 'Bắp cải xào trứng đơn giản, nhanh gọn, ngon cơm',
        cookingTime: 15,
        servings: 4,
        difficulty: 'easy',
        calories: 130,
        protein: 8,
        carbs: 10,
        fat: 7,
        tags: ['nhanh', 'rau'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: null,
        estimatedCost: 15000,
        steps: [
          { step: 1, description: 'Cắt bắp cải sợi, đánh trứng' },
          {
            step: 2,
            description: 'Xào bắp cải với tỏi phi, cho trứng vào đảo',
          },
          { step: 3, description: 'Nêm nước mắm, tiêu, tắt bếp' },
        ],
        ingredients: [
          { name: 'Bắp cải', quantity: 300, unit: 'g' },
          { name: 'Trứng gà', quantity: 3, unit: 'quả' },
          { name: 'Tỏi', quantity: 3, unit: 'tép' },
          { name: 'Nước mắm', quantity: 10, unit: 'ml' },
          { name: 'Dầu ăn', quantity: 10, unit: 'ml' },
        ],
      },
      {
        name: 'Tôm rim nước mắm',
        description: 'Tôm rim mặn ngọt kiểu Việt, ăn cơm rất hao',
        cookingTime: 20,
        servings: 4,
        difficulty: 'easy',
        calories: 220,
        protein: 25,
        carbs: 8,
        fat: 8,
        tags: ['hải sản', 'nhanh'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: null,
        estimatedCost: 70000,
        steps: [
          { step: 1, description: 'Cắt râu tôm, rửa sạch' },
          {
            step: 2,
            description: 'Phi tỏi, cho tôm vào đảo, thêm nước mắm, đường',
          },
          {
            step: 3,
            description: 'Rim lửa nhỏ 10 phút đến khi tôm thấm gia vị',
          },
        ],
        ingredients: [
          { name: 'Tôm', quantity: 300, unit: 'g' },
          { name: 'Tỏi', quantity: 5, unit: 'tép' },
          { name: 'Nước mắm', quantity: 20, unit: 'ml' },
          { name: 'Đường', quantity: 15, unit: 'g' },
          { name: 'Ớt', quantity: 1, unit: 'quả' },
        ],
      },
      {
        name: 'Canh cải thịt bò',
        description: 'Canh rau cải nấu thịt bò, ngọt nước tự nhiên',
        cookingTime: 20,
        servings: 4,
        difficulty: 'easy',
        calories: 150,
        protein: 15,
        carbs: 5,
        fat: 8,
        tags: ['canh', 'nhanh'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: null,
        estimatedCost: 40000,
        steps: [
          { step: 1, description: 'Thái thịt bò mỏng, ướp gia vị' },
          { step: 2, description: 'Đun sôi nước, cho thịt bò vào' },
          { step: 3, description: 'Cho rau cải vào, nêm nước mắm, tắt bếp' },
        ],
        ingredients: [
          { name: 'Thịt bò', quantity: 200, unit: 'g' },
          { name: 'Rau cải', quantity: 200, unit: 'g' },
          { name: 'Nước mắm', quantity: 10, unit: 'ml' },
          { name: 'Hành lá', quantity: 10, unit: 'g' },
        ],
      },
      {
        name: 'Đậu que xào tỏi',
        description: 'Đậu que xào tỏi giòn ngọt, món rau đơn giản',
        cookingTime: 15,
        servings: 4,
        difficulty: 'easy',
        calories: 75,
        protein: 3,
        carbs: 10,
        fat: 3,
        tags: ['chay', 'rau', 'nhanh'],
        mealType: ['lunch', 'dinner'],
        cuisineRegion: null,
        estimatedCost: 12000,
        steps: [
          { step: 1, description: 'Cắt đậu que khúc 4cm, rửa sạch' },
          {
            step: 2,
            description: 'Phi tỏi với dầu ăn, cho đậu que vào xào lửa lớn',
          },
          { step: 3, description: 'Nêm nước mắm, đảo đều 3 phút, tắt bếp' },
        ],
        ingredients: [
          { name: 'Đậu que', quantity: 300, unit: 'g' },
          { name: 'Tỏi', quantity: 4, unit: 'tép' },
          { name: 'Nước mắm', quantity: 10, unit: 'ml' },
          { name: 'Dầu ăn', quantity: 10, unit: 'ml' },
        ],
      },
    ];

    for (const recipeData of recipes) {
      const { ingredients, ...data } = recipeData;

      const recipe = this.recipeRepo.create(data);
      const nutritionData: Record<
        string,
        { sugar: number; sodium: number; fiber: number }
      > = {
        'Bánh mì trứng ốp la': { sugar: 2.0, sodium: 450.0, fiber: 1.5 },
        'Phở bò': { sugar: 3.0, sodium: 1200.0, fiber: 2.0 },
        'Cháo gà': { sugar: 1.0, sodium: 600.0, fiber: 1.0 },
        'Bún bò Huế': { sugar: 4.0, sodium: 1500.0, fiber: 2.0 },
        'Cơm tấm sườn nướng': { sugar: 8.0, sodium: 900.0, fiber: 1.5 },
        'Rau muống xào tỏi': { sugar: 0.5, sodium: 350.0, fiber: 3.0 },
        'Canh chua cá lóc': { sugar: 12.0, sodium: 800.0, fiber: 2.5 },
        'Đậu phụ sốt cà chua': { sugar: 4.0, sodium: 500.0, fiber: 2.0 },
        'Thịt kho trứng': { sugar: 15.0, sodium: 1100.0, fiber: 0.5 },
        'Canh bí đao thịt heo': { sugar: 2.0, sodium: 400.0, fiber: 1.8 },
        'Cá thu kho': { sugar: 8.0, sodium: 1000.0, fiber: 0.5 },
        'Gỏi cuốn tôm thịt': { sugar: 1.0, sodium: 300.0, fiber: 2.5 },
        'Khổ qua nhồi thịt': { sugar: 2.0, sodium: 500.0, fiber: 3.5 },
        'Bắp cải xào trứng': { sugar: 2.5, sodium: 400.0, fiber: 2.2 },
        'Tôm rim nước mắm': { sugar: 10.0, sodium: 950.0, fiber: 0.2 },
        'Canh cải thịt bò': { sugar: 1.0, sodium: 350.0, fiber: 2.0 },
        'Đậu que xào tỏi': { sugar: 1.5, sodium: 300.0, fiber: 2.5 },
      };
      const nutrition = nutritionData[recipe.name] || {
        sugar: 0,
        sodium: 0,
        fiber: 0,
      };
      recipe.sugar = nutrition.sugar;
      recipe.sodium = nutrition.sodium;
      recipe.fiber = nutrition.fiber;
      await this.recipeRepo.save(recipe);

      // Link ingredients
      for (const ing of ingredients) {
        const ingredientId = this.ingredientMap.get(ing.name);
        if (ingredientId) {
          const ri = this.riRepo.create({
            recipeId: recipe.id,
            ingredientId,
            quantity: ing.quantity,
            unit: ing.unit,
            isOptional: false,
          });
          await this.riRepo.save(ri);
        }
      }
    }
  }

  private async updateExistingRecipesNutrition() {
    const nutritionData: Record<
      string,
      { sugar: number; sodium: number; fiber: number }
    > = {
      'Bánh mì trứng ốp la': { sugar: 2.0, sodium: 450.0, fiber: 1.5 },
      'Phở bò': { sugar: 3.0, sodium: 1200.0, fiber: 2.0 },
      'Cháo gà': { sugar: 1.0, sodium: 600.0, fiber: 1.0 },
      'Bún bò Huế': { sugar: 4.0, sodium: 1500.0, fiber: 2.0 },
      'Cơm tấm sườn nướng': { sugar: 8.0, sodium: 900.0, fiber: 1.5 },
      'Rau muống xào tỏi': { sugar: 0.5, sodium: 350.0, fiber: 3.0 },
      'Canh chua cá lóc': { sugar: 12.0, sodium: 800.0, fiber: 2.5 },
      'Đậu phụ sốt cà chua': { sugar: 4.0, sodium: 500.0, fiber: 2.0 },
      'Thịt kho trứng': { sugar: 15.0, sodium: 1100.0, fiber: 0.5 },
      'Canh bí đao thịt heo': { sugar: 2.0, sodium: 400.0, fiber: 1.8 },
      'Cá thu kho': { sugar: 8.0, sodium: 1000.0, fiber: 0.5 },
      'Gỏi cuốn tôm thịt': { sugar: 1.0, sodium: 300.0, fiber: 2.5 },
      'Khổ qua nhồi thịt': { sugar: 2.0, sodium: 500.0, fiber: 3.5 },
      'Bắp cải xào trứng': { sugar: 2.5, sodium: 400.0, fiber: 2.2 },
      'Tôm rim nước mắm': { sugar: 10.0, sodium: 950.0, fiber: 0.2 },
      'Canh cải thịt bò': { sugar: 1.0, sodium: 350.0, fiber: 2.0 },
      'Đậu que xào tỏi': { sugar: 1.5, sodium: 300.0, fiber: 2.5 },
    };

    for (const [name, info] of Object.entries(nutritionData)) {
      const recipe = await this.recipeRepo.findOne({ where: { name } });
      if (recipe) {
        recipe.sugar = info.sugar;
        recipe.sodium = info.sodium;
        recipe.fiber = info.fiber;
        await this.recipeRepo.save(recipe);
      }
    }
    console.log(
      '✅ Updated nutrition data (sugar, sodium, fiber) for existing recipes in DB.',
    );
  }
}
