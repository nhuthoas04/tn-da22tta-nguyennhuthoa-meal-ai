import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RecipeRating } from './entities/recipe-rating.entity';
import { Recipe } from './entities/recipe.entity';
import { User } from '../auth/entities/user.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { ReviewModerationService } from './review-moderation.service';
import { NotificationService } from '../notification/notification.service';
import {
  FLAGGED_REVIEW_REASON,
  INAPPROPRIATE_REVIEW_TEXT,
} from './bad-words';

@Injectable()
export class RecipeRatingService {
  private readonly logger = new Logger(RecipeRatingService.name);

  constructor(
    @InjectRepository(RecipeRating)
    private readonly ratingRepo: Repository<RecipeRating>,
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AdminNotification)
    private readonly notificationRepo: Repository<AdminNotification>,
    private readonly moderationService: ReviewModerationService,
    private readonly notificationService: NotificationService,
  ) {}

  private toPublicRatingResponse(rating: RecipeRating): RecipeRating {
    return {
      ...rating,
      originalReview: null,
    } as RecipeRating;
  }

  async createOrUpdateRating(
    userId: string,
    recipeId: string,
    rating: number,
    review: string,
  ): Promise<RecipeRating> {
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Điểm đánh giá phải từ 1 đến 5 sao.');
    }

    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException('Không tìm thấy công thức món ăn.');
    }

    // 1. Fetch user to check constraints
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    const normalizedReview = review?.trim() || '';
    const keywordResult =
      this.moderationService.filterBadWords(normalizedReview);
    const isFlagged = keywordResult.isViolating;
    const flaggedWords = isFlagged
      ? keywordResult.matchedWords.join(', ')
      : null;
    const flaggedReason = isFlagged ? FLAGGED_REVIEW_REASON : null;
    const publicReview = isFlagged
      ? INAPPROPRIATE_REVIEW_TEXT
      : normalizedReview;
    const moderationStatus = isFlagged ? 'flagged' : 'approved';

    let ratingObj = await this.ratingRepo.findOne({
      where: { userId, recipeId },
    });
    const wasFlagged = ratingObj?.isFlagged === true;

    if (isFlagged && !wasFlagged) {
      user.violationCount = (user.violationCount || 0) + 1;
      await this.userRepo.save(user);
    }

    if (ratingObj) {
      ratingObj.rating = rating;
      ratingObj.review = publicReview;
      ratingObj.originalReview = isFlagged ? normalizedReview : null;
      ratingObj.isFlagged = isFlagged;
      ratingObj.flaggedWords = flaggedWords;
      ratingObj.flaggedReason = flaggedReason;
      ratingObj.moderationStatus = moderationStatus;
    } else {
      ratingObj = this.ratingRepo.create({
        userId,
        recipeId,
        rating,
        review: publicReview,
        originalReview: isFlagged ? normalizedReview : null,
        isFlagged,
        flaggedWords,
        flaggedReason,
        moderationStatus,
      });
    }

    const savedRating = await this.ratingRepo.save(ratingObj);

    // Send Personal Notification if not self-action and approved
    if (recipe.submittedBy && moderationStatus === 'approved') {
      try {
        const actorName = user.fullName || 'Ai đó';
        if (review && review.trim().length > 0) {
          await this.notificationService.createNotification(
            recipe.submittedBy,
            userId,
            recipeId,
            'COMMENT_POST',
            `${actorName} đã bình luận bài viết của bạn.`,
          );
        } else {
          await this.notificationService.createNotification(
            recipe.submittedBy,
            userId,
            recipeId,
            'RATE_POST',
            `${actorName} đã đánh giá bài viết của bạn ${rating} sao.`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          'Failed to create personal notification:',
          err.message,
        );
      }
    }

    // Create AdminNotification if flagged
    if (isFlagged) {
      try {
        const notification =
          (await this.notificationRepo.findOne({
            where: { reviewId: savedRating.id, isRead: false },
          })) ||
          this.notificationRepo.create({
            type: 'review_violation',
            reviewId: savedRating.id,
            userId: user.id,
          });
        notification.title =
          'Phát hiện bình luận chứa nội dung không phù hợp';
        notification.message = `Có đánh giá chứa từ ngữ không phù hợp trong công thức "${recipe.name}".`;
        notification.isRead = false;
        await this.notificationRepo.save(notification);
      } catch (err: any) {
        this.logger.error('Failed to create admin notification:', err.message);
      }
    } else {
      await this.notificationRepo.update(
        { reviewId: savedRating.id },
        { isRead: true },
      );
    }

    return this.toPublicRatingResponse(savedRating);
  }

  async getRatingsForRecipe(
    recipeId: string,
    page = 1,
    limit = 10,
    currentUserId?: string,
  ): Promise<{ data: any[]; total: number }> {
    const qb = this.ratingRepo
      .createQueryBuilder('rating')
      .leftJoinAndSelect('rating.user', 'user')
      .leftJoinAndSelect('rating.replies', 'reply')
      .leftJoinAndSelect('reply.user', 'replyUser')
      .where('rating.recipeId = :recipeId', { recipeId })
      .andWhere('rating.parentId IS NULL');

    qb.andWhere('rating.moderationStatus != :removedStatus', {
      removedStatus: 'removed',
    });

    const [data, total] = await qb
      .orderBy('rating.createdAt', 'DESC')
      .addOrderBy('reply.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: data.map((r) => ({
        id: r.id,
        rating: r.rating,
        review: r.review,
        isFlagged: r.isFlagged,
        moderationStatus: r.moderationStatus,
        createdAt: r.createdAt,
        user: {
          id: r.user?.id,
          fullName: r.user?.fullName,
          avatarUrl: r.user?.avatarUrl,
        },
        replies: (r.replies || [])
          .filter((rep) => rep.moderationStatus !== 'removed')
          .map((rep) => ({
            id: rep.id,
            review: rep.review,
            isFlagged: rep.isFlagged,
            moderationStatus: rep.moderationStatus,
            createdAt: rep.createdAt,
            user: {
              id: rep.user?.id,
              fullName: rep.user?.fullName,
              avatarUrl: rep.user?.avatarUrl,
            },
          })),
      })),
      total,
    };
  }

  async updateRating(
    userId: string,
    ratingId: string,
    rating: number,
    review: string,
  ): Promise<RecipeRating> {
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Điểm đánh giá phải từ 1 đến 5 sao.');
    }

    const ratingObj = await this.ratingRepo.findOne({
      where: { id: ratingId },
    });
    if (!ratingObj) {
      throw new NotFoundException('Không tìm thấy bình luận đánh giá.');
    }

    if (ratingObj.userId !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa bình luận này.',
      );
    }

    // 1. Fetch user to check constraints
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    const recipe = await this.recipeRepo.findOne({
      where: { id: ratingObj.recipeId },
    });

    const normalizedReview = review?.trim() || '';
    const keywordResult =
      this.moderationService.filterBadWords(normalizedReview);
    const isFlagged = keywordResult.isViolating;
    const flaggedWords = isFlagged
      ? keywordResult.matchedWords.join(', ')
      : null;
    const flaggedReason = isFlagged ? FLAGGED_REVIEW_REASON : null;
    const publicReview = isFlagged
      ? INAPPROPRIATE_REVIEW_TEXT
      : normalizedReview;
    const moderationStatus = isFlagged ? 'flagged' : 'approved';

    if (isFlagged && !ratingObj.isFlagged) {
      user.violationCount = (user.violationCount || 0) + 1;
      await this.userRepo.save(user);
    }

    ratingObj.rating = rating;
    ratingObj.review = publicReview;
    ratingObj.originalReview = isFlagged ? normalizedReview : null;
    ratingObj.isFlagged = isFlagged;
    ratingObj.flaggedWords = flaggedWords;
    ratingObj.flaggedReason = flaggedReason;
    ratingObj.moderationStatus = moderationStatus;

    const savedRating = await this.ratingRepo.save(ratingObj);

    if (isFlagged) {
      try {
        const notification =
          (await this.notificationRepo.findOne({
            where: { reviewId: savedRating.id, isRead: false },
          })) ||
          this.notificationRepo.create({
            type: 'review_violation',
            reviewId: savedRating.id,
            userId: user.id,
          });
        notification.title =
          'Phát hiện bình luận chỉnh sửa chứa nội dung không phù hợp';
        notification.message = `Có đánh giá chứa từ ngữ không phù hợp trong công thức "${recipe?.name || 'món ăn'}".`;
        notification.isRead = false;
        await this.notificationRepo.save(notification);
      } catch (err: any) {
        this.logger.error('Failed to create admin notification:', err.message);
      }
    } else {
      await this.notificationRepo.update(
        { reviewId: savedRating.id },
        { isRead: true },
      );
    }

    return this.toPublicRatingResponse(savedRating);
  }

  async deleteRating(
    userId: string,
    userRole: string,
    ratingId: string,
  ): Promise<{ message: string }> {
    const ratingObj = await this.ratingRepo.findOne({
      where: { id: ratingId },
    });
    if (!ratingObj) {
      throw new NotFoundException('Không tìm thấy bình luận đánh giá.');
    }

    if (ratingObj.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Bạn không có quyền xóa bình luận này.');
    }

    await this.ratingRepo.remove(ratingObj);
    return { message: 'Đã xóa bình luận đánh giá thành công.' };
  }

  async getAverageRatingForRecipe(
    recipeId: string,
  ): Promise<{ average: number; count: number }> {
    const result = await this.ratingRepo
      .createQueryBuilder('rating')
      .select('AVG(rating.rating)', 'avg')
      .addSelect('COUNT(rating.id)', 'count')
      .where('rating.recipeId = :recipeId', { recipeId })
      .andWhere('rating.moderationStatus != :status', { status: 'removed' })
      .andWhere('rating.parentId IS NULL')
      .andWhere('rating.rating IS NOT NULL')
      .getRawOne();

    const count = parseInt(result?.count || '0', 10);
    const average = parseFloat(result?.avg || '0');

    return {
      average: Math.round(average * 10) / 10,
      count,
    };
  }

  async createReply(
    userId: string,
    recipeId: string,
    parentId: string,
    review: string,
  ): Promise<RecipeRating> {
    if (!review || review.trim().length === 0) {
      throw new BadRequestException('Nội dung phản hồi không được để trống.');
    }

    const parentRating = await this.ratingRepo.findOne({
      where: { id: parentId },
    });
    if (!parentRating) {
      throw new NotFoundException('Không tìm thấy bình luận gốc để trả lời.');
    }

    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException('Không tìm thấy công thức món ăn.');
    }

    // 1. Fetch user to check constraints
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    const normalizedReview = review.trim();
    const keywordResult =
      this.moderationService.filterBadWords(normalizedReview);
    const isFlagged = keywordResult.isViolating;
    const flaggedWords = isFlagged
      ? keywordResult.matchedWords.join(', ')
      : null;
    const flaggedReason = isFlagged ? FLAGGED_REVIEW_REASON : null;
    const publicReview = isFlagged
      ? INAPPROPRIATE_REVIEW_TEXT
      : normalizedReview;
    const moderationStatus = isFlagged ? 'flagged' : 'approved';

    if (isFlagged) {
      user.violationCount = (user.violationCount || 0) + 1;
      await this.userRepo.save(user);
    }

    const reply = this.ratingRepo.create({
      recipeId,
      userId,
      rating: null,
      parentId,
      review: publicReview,
      originalReview: isFlagged ? normalizedReview : null,
      isFlagged,
      flaggedWords,
      flaggedReason,
      moderationStatus,
    });

    const savedReply = await this.ratingRepo.save(reply);

    // Send Personal Notification for REPLY_COMMENT
    if (parentRating.userId && moderationStatus === 'approved') {
      try {
        const actorName = user.fullName || 'Ai đó';
        const isRating =
          parentRating.rating !== null && parentRating.rating !== undefined;
        const message = isRating
          ? `${actorName} đã trả lời đánh giá của bạn.`
          : `${actorName} đã phản hồi bình luận của bạn.`;
        await this.notificationService.createNotification(
          parentRating.userId,
          userId,
          recipeId,
          'REPLY_COMMENT',
          message,
        );
      } catch (err: any) {
        this.logger.error(
          'Failed to create personal reply notification:',
          err.message,
        );
      }
    }

    // Create AdminNotification if flagged
    if (isFlagged) {
      try {
        const notification = this.notificationRepo.create({
          title: 'Phát hiện phản hồi bình luận chứa nội dung không phù hợp',
          message: `Có phản hồi chứa từ ngữ không phù hợp trong công thức "${recipe.name}".`,
          type: 'review_violation',
          reviewId: savedReply.id,
          userId: user.id,
          isRead: false,
        });
        await this.notificationRepo.save(notification);
      } catch (err: any) {
        this.logger.error('Failed to create admin notification:', err.message);
      }
    }

    return this.toPublicRatingResponse(savedReply);
  }

  // ==================== ADMIN MODERATION METHODS ====================
  async getFlaggedReviews(): Promise<{
    data: any[];
    total: number;
  }> {
    const [data, total] = await this.ratingRepo.findAndCount({
      where: {
        moderationStatus: In(['flagged', 'pending']),
        isFlagged: true,
      },
      relations: ['user', 'recipe'],
      order: { createdAt: 'DESC' },
    });

    return {
      data: data.map((review) => ({
        id: review.id,
        rating: review.rating,
        review: review.review,
        originalReview: review.originalReview,
        flaggedWords: review.flaggedWords,
        flaggedReason: review.flaggedReason,
        moderationStatus: review.moderationStatus,
        createdAt: review.createdAt,
        user: review.user
          ? {
              id: review.user.id,
              fullName: review.user.fullName,
              email: review.user.email,
              violationCount: review.user.violationCount,
            }
          : null,
        recipe: review.recipe
          ? {
              id: review.recipe.id,
              name: review.recipe.name,
            }
          : null,
      })),
      total,
    };
  }

  async ignoreFlaggedReview(reviewId: string): Promise<RecipeRating> {
    const review = await this.ratingRepo.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Không tìm thấy bình luận.');
    }

    review.moderationStatus = 'ignored';
    const saved = await this.ratingRepo.save(review);
    await this.notificationRepo.update({ reviewId }, { isRead: true });
    return saved;
  }

  async deleteFlaggedReview(
    reviewId: string,
  ): Promise<{ message: string }> {
    const review = await this.ratingRepo.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Không tìm thấy bình luận.');
    }

    await this.ratingRepo.remove(review);
    return { message: 'Đã xóa bình luận vi phạm.' };
  }

  async getAdminNotifications(): Promise<{
    data: AdminNotification[];
    unreadCount: number;
  }> {
    const notifications = await this.notificationRepo.find({
      relations: ['review', 'review.recipe', 'user'],
      order: { createdAt: 'DESC' },
    });
    const unreadCount = await this.notificationRepo.count({
      where: { isRead: false },
    });
    return { data: notifications, unreadCount };
  }

  async markNotificationAsRead(id: string): Promise<AdminNotification> {
    const notification = await this.notificationRepo.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }
    notification.isRead = true;
    return await this.notificationRepo.save(notification);
  }

  async approveReview(reviewId: string): Promise<RecipeRating> {
    return this.ignoreFlaggedReview(reviewId);
  }

  async rejectReview(reviewId: string): Promise<{ message: string }> {
    return this.deleteFlaggedReview(reviewId);
  }

  async getUserRatings(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: any[]; total: number }> {
    const [data, total] = await this.ratingRepo.findAndCount({
      where: { userId, parentId: null },
      relations: ['recipe'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data.map((r) => ({
        id: r.id,
        rating: r.rating,
        review: r.review,
        createdAt: r.createdAt,
        recipe: r.recipe
          ? {
              id: r.recipe.id,
              name: r.recipe.name,
              imageUrl: r.recipe.imageUrl,
            }
          : null,
      })),
      total,
    };
  }

  async unlockUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }
    user.violationCount = 0;
    user.isCommentModerated = false;
    user.commentLockedUntil = null;
    return await this.userRepo.save(user);
  }
}
