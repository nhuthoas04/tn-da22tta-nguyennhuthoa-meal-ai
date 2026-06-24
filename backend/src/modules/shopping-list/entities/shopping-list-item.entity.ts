import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ShoppingList } from './shopping-list.entity';
import { Ingredient } from '../../recipes/entities/ingredient.entity';

@Entity('shopping_list_items')
export class ShoppingListItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  shoppingListId: string;

  @Column({ type: 'uuid' })
  ingredientId: string;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  quantityNeeded: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  quantitySourced: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  availableQuantity: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  needToBuyQuantity: number;

  @Column({ type: 'varchar', length: 20 })
  unit: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string; // For grouping in UI

  @Column({ type: 'boolean', default: false })
  isPurchased: boolean;

  @Column({ type: 'boolean', default: false })
  isEnoughFromInventory: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  estimatedPrice: number;

  // --- Relations ---
  @ManyToOne(() => ShoppingList, (sl) => sl.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shoppingListId' })
  shoppingList: ShoppingList;

  @ManyToOne(() => Ingredient)
  @JoinColumn({ name: 'ingredientId' })
  ingredient: Ingredient;
}
