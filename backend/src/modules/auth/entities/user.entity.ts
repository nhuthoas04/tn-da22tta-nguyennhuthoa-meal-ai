import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { UserPreference } from './user-preference.entity';
import { Inventory } from '../../inventory/entities/inventory.entity';
import { MealPlan } from '../../meal-plan/entities/meal-plan.entity';
import { Favorite } from '../../recipes/entities/favorite.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', length: 10, default: 'user' })
  role: string; // 'user' | 'admin'

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  gender: string; // 'male' | 'female'

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  weight: number; // kg

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  height: number; // cm

  @Column({ type: 'varchar', length: 20, default: 'moderate' })
  activityLevel: string; // sedentary | light | moderate | active | very_active

  @Column({ type: 'int', nullable: true })
  dailyCalorieTarget: number; // Cached TDEE

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date;

  @Column({ type: 'int', default: 0 })
  violationCount: number;

  @Column({ type: 'boolean', default: false })
  isCommentModerated: boolean;

  @Column({ type: 'timestamp', nullable: true })
  commentLockedUntil: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // --- Relations ---
  @OneToOne(() => UserPreference, (pref) => pref.user, { cascade: true })
  preferences: UserPreference;

  @OneToMany(() => Inventory, (inv) => inv.user)
  inventory: Inventory[];

  @OneToMany(() => MealPlan, (mp) => mp.user)
  mealPlans: MealPlan[];

  @OneToMany(() => Favorite, (fav) => fav.user)
  favorites: Favorite[];
}
