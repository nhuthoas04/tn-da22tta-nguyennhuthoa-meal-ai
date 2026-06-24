import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Ingredient } from '../../recipes/entities/ingredient.entity';

/** Tracks user's available ingredients with expiration dates for anti-waste AI */
@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  ingredientId: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  initialQuantity: number;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 20 })
  unit: string;

  @Column({ type: 'date', nullable: true })
  expirationDate: Date;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  purchaseDate: Date;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  addedDate: Date;

  @Column({ type: 'varchar', length: 200, nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // --- Relations ---
  @ManyToOne(() => User, (user) => user.inventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Ingredient, (ing) => ing.inventoryItems)
  @JoinColumn({ name: 'ingredientId' })
  ingredient: Ingredient;
}
