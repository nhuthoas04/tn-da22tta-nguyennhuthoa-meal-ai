import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    UpdateDateColumn, OneToMany, ManyToOne, JoinColumn,
} from 'typeorm';
import { RecipeIngredient } from './recipe-ingredient.entity';
import { Favorite } from './favorite.entity';
import { MealPlanItem } from '../../meal-plan/entities/meal-plan-item.entity';
import { User } from '../../auth/entities/user.entity';
import { RecipeRating } from './recipe-rating.entity';
import { RecipeView } from './recipe-view.entity';

@Entity('recipes')
export class Recipe {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 200 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    imageUrl: string;

    @Column({ type: 'int' })
    cookingTime: number; // minutes

    @Column({ type: 'int', default: 4 })
    servings: number;

    @Column({ type: 'varchar', length: 15, default: 'easy' })
    difficulty: string; // easy | medium | hard

    @Column({ type: 'int' })
    calories: number; // kcal per serving

    @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
    protein: number;

    @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
    carbs: number;

    @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
    fat: number;

    @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
    sugar: number;

    @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
    sodium: number;

    @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
    fiber: number;

    @Column({ type: 'simple-array', nullable: true })
    tags: string[]; // ['chay', 'miền Nam', 'nhanh']

    @Column({ type: 'simple-array', nullable: true })
    mealType: string[]; // ['breakfast', 'lunch', 'dinner']

    @Column({ type: 'varchar', length: 30, nullable: true })
    cuisineRegion: string; // miền Bắc / miền Trung / miền Nam

    @Column({ type: 'jsonb' })
    steps: { step: number; description: string }[];

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    estimatedCost: number; // VND per serving

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @Column({ type: 'varchar', length: 15, default: 'approved' })
    status: string; // 'pending' | 'approved' | 'rejected'

    @Column({ type: 'uuid', nullable: true })
    submittedBy: string; // FK → users.id

    @Column({ type: 'text', nullable: true })
    rejectionReason: string;

    @Column({ type: 'int', default: 0 })
    views: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    // --- Relations ---
    @OneToMany(() => RecipeIngredient, (ri) => ri.recipe, { cascade: true })
    recipeIngredients: RecipeIngredient[];

    @OneToMany(() => Favorite, (fav) => fav.recipe)
    favorites: Favorite[];

    @OneToMany(() => MealPlanItem, (mpi) => mpi.recipe)
    mealPlanItems: MealPlanItem[];

    @OneToMany(() => RecipeRating, (rating) => rating.recipe, { cascade: true })
    ratings: RecipeRating[];

    @OneToMany(() => RecipeView, (view) => view.recipe)
    viewsLog: RecipeView[];

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'submittedBy' })
    submitter: User;
}
