import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { MealPlan } from './meal-plan.entity';
import { Recipe } from '../../recipes/entities/recipe.entity';

@Entity('meal_plan_items')
export class MealPlanItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    mealPlanId: string;

    @Column({ type: 'uuid' })
    recipeId: string;

    @Column({ type: 'date', name: 'meal_date' })
    mealDate: Date;

    @Column({ type: 'varchar', length: 10 })
    mealType: string; // breakfast | lunch | dinner

    @Column({ type: 'int', nullable: true })
    calories: number; // Cached from recipe

    @Column({ type: 'boolean', default: false })
    isLocked: boolean; // User-locked slots survive regeneration

    @Column({ type: 'boolean', default: false })
    isConsumed: boolean; // Trạng thái đã ăn/đã hoàn thành

    @Column({ type: 'varchar', length: 200, nullable: true })
    notes: string;

    // --- Relations ---
    @ManyToOne(() => MealPlan, (mp) => mp.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'mealPlanId' })
    mealPlan: MealPlan;

    @ManyToOne(() => Recipe, (recipe) => recipe.mealPlanItems)
    @JoinColumn({ name: 'recipeId' })
    recipe: Recipe;
}
