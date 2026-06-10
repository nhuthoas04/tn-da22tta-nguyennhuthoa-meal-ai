import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Recipe } from './recipe.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('recipe_ratings')
export class RecipeRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  recipeId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'int', nullable: true })
  rating: number; // 1 to 5 stars (nullable for comment replies)

  @Column({ type: 'uuid', nullable: true })
  parentId: string;

  @Column({ type: 'text', nullable: true })
  review: string;

  @Column({ type: 'text', nullable: true })
  originalReview: string;

  @Column({ type: 'boolean', default: false })
  isFlagged: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  flaggedWords: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  flaggedReason: string;

  @Column({ type: 'varchar', length: 50, default: 'reviewed' })
  moderationStatus: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // --- Relations ---
  @ManyToOne(() => Recipe, (recipe) => recipe.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipeId' })
  recipe: Recipe;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => RecipeRating, (rating) => rating.replies, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent: RecipeRating;

  @OneToMany(() => RecipeRating, (rating) => rating.parent)
  replies: RecipeRating[];
}
