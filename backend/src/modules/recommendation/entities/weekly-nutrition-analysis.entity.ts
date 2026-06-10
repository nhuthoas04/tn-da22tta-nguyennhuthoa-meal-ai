import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('weekly_nutrition_analyses')
export class WeeklyNutritionAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 10 })
  weekStart: string; // YYYY-MM-DD (must be Monday)

  @Column({ type: 'int' })
  nutritionScore: number; // 0 - 100

  @Column({ type: 'simple-array' })
  strengths: string[];

  @Column({ type: 'simple-array' })
  weaknesses: string[];

  @Column({ type: 'simple-array' })
  recommendations: string[];

  @Column({ type: 'jsonb' })
  macroSummary: {
    totalCalories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    greensCount: number; // Number of meals with leafy/greens
  };

  @CreateDateColumn()
  createdAt: Date;
}
