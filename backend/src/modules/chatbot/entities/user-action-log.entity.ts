import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('user_action_logs')
export class UserActionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 30 })
  actionType: 'accept' | 'reject' | 'view_detail';

  @Column({ type: 'uuid', nullable: true })
  recipeId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mealType: string; // breakfast | lunch | dinner

  @Column({ type: 'jsonb', nullable: true })
  metaData: {
    reason?: string;
    cookingTime?: number;
    calories?: number;
  };

  @CreateDateColumn()
  createdAt: Date;
}
