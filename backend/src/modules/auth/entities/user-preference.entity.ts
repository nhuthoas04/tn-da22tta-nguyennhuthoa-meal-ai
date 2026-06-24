import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_preferences')
export class UserPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 30, default: 'normal' })
  dietType: string; // normal | vegetarian | vegan | keto | low_carb

  @Column({ type: 'simple-array', nullable: true })
  allergies: string[]; // Allergen names

  @Column({ type: 'simple-array', nullable: true })
  dislikedIngredients: string[];

  @Column({ type: 'simple-array', nullable: true })
  likedIngredients: string[];

  @Column({ type: 'simple-array', nullable: true })
  cuisineTags: string[]; // ['miền Nam', 'miền Bắc']

  @Column({ type: 'simple-array', nullable: true })
  recentSuggestedRecipes: string[];

  @Column({ type: 'int', default: 60 })
  maxCookingTime: number; // minutes

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  budgetPerMeal: number; // VND

  @Column({ type: 'int', nullable: true })
  servings: number | null; // Family size

  @Column({ type: 'varchar', length: 500, nullable: true })
  healthConditions: string; // e.g. 'diabetes,hypertension'

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  maxSugarPerMeal: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  maxSodiumPerMeal: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  minProteinPerMeal: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // --- Relations ---
  @OneToOne(() => User, (user) => user.preferences, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
