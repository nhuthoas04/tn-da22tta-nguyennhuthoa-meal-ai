import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
    ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Recipe } from './recipe.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('recipe_views')
@Index(['recipeId', 'viewerKey', 'createdAt'])
export class RecipeView {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    recipeId: string;

    @Column({ type: 'uuid', nullable: true })
    userId: string | null;

    @Column({ type: 'varchar', length: 100 })
    viewerKey: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    userAgent: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => Recipe, (recipe) => recipe.viewsLog, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'recipeId' })
    recipe: Recipe;

    @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'userId' })
    user: User | null;
}
