import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Inventory } from './inventory.entity';
import { MealPlan } from '../../meal-plan/entities/meal-plan.entity';
import { MealPlanItem } from '../../meal-plan/entities/meal-plan-item.entity';
import { ShoppingList } from '../../shopping-list/entities/shopping-list.entity';

@Entity('inventory_allocations')
export class InventoryAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  inventoryItemId: string;

  @Column({ type: 'uuid', nullable: true })
  mealPlanId: string;

  @Column({ type: 'uuid', nullable: true })
  mealPlanItemId: string;

  @Column({ type: 'uuid', nullable: true })
  shoppingListId: string;

  @Column({ type: 'uuid', nullable: true })
  shoppingListItemId: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  quantityAllocated: number;

  @Column({ type: 'uuid', nullable: true })
  recipeId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recipeName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ingredientName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shoppingListName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unit: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  usedForMeal: string;

  @Column({ type: 'date', nullable: true })
  usedForDate: Date;

  @Column({ type: 'varchar', length: 30, default: 'shopping_list' })
  usageType: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  revertedAt: Date;

  @CreateDateColumn({ name: 'allocation_date' })
  allocationDate: Date;

  // --- Relations ---
  @ManyToOne(() => Inventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventoryItemId' })
  inventoryItem: Inventory;

  @ManyToOne(() => MealPlan, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'mealPlanId' })
  mealPlan: MealPlan;

  @ManyToOne(() => MealPlanItem, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'mealPlanItemId' })
  mealPlanItem: MealPlanItem;

  @ManyToOne(() => ShoppingList, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'shoppingListId' })
  shoppingList: ShoppingList;
}
