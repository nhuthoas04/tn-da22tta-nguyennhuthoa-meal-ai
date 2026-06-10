import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RecipeRating } from './recipe-rating.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('admin_notifications')
export class AdminNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 50, default: 'review_violation' })
  type: string;

  @Column({ type: 'uuid', nullable: true })
  reviewId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;

  // --- Relations ---
  @ManyToOne(() => RecipeRating, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'reviewId' })
  review: RecipeRating;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;
}
