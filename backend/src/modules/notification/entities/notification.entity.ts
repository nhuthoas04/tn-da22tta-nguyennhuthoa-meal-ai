import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Recipe } from '../../recipes/entities/recipe.entity';

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userId: string; // Recipient

    @Column({ type: 'uuid', nullable: true })
    actorId: string; // Performer of the action

    @Column({ type: 'uuid', nullable: true })
    postId: string; // Recipe associated with the notification

    @Column({ type: 'varchar', length: 50 })
    type: string; // RATE_POST | COMMENT_POST | REPLY_COMMENT | SAVE_RECIPE

    @Column({ type: 'text' })
    message: string;

    @Column({ type: 'boolean', default: false })
    isRead: boolean;

    @CreateDateColumn()
    createdAt: Date;

    // --- Relations ---
    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'actorId' })
    actor: User;

    @ManyToOne(() => Recipe, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'postId' })
    post: Recipe;
}
