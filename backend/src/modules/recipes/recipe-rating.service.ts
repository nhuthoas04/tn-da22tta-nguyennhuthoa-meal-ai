import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecipeRating } from './entities/recipe-rating.entity';
import { Recipe } from './entities/recipe.entity';
import { User } from '../auth/entities/user.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { ReviewModerationService } from './review-moderation.service';
import { NotificationService } from '../notification/notification.service';

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

    // Check if user is locked out from commenting
    if (user.commentLockedUntil && new Date() < user.commentLockedUntil) {
      const lockDate = new Date(user.commentLockedUntil).toLocaleString('vi-VN');
      throw new ForbiddenException(`Tài khoản của bạn tạm thời bị khóa quyền bình luận đến ${lockDate} do vi phạm nhiều lần.`);
    }

    // 2. Perform Keyword and AI moderation
    let isFlagged = false;
    let flaggedReason = '';
    let flaggedWords = '';
    let censoredReview = review;

    // Apply Keyword filtering
    const keywordResult = this.moderationService.filterBadWords(review);
    if (keywordResult.isViolating) {
      isFlagged = true;
      censoredReview = keywordResult.censoredText;
      flaggedWords = keywordResult.matchedWords.join(', ');
      flaggedReason = `Từ ngữ nhạy cảm: ${flaggedWords}`;
    }

    // Apply AI Moderation if not flagged by keywords
    if (!isFlagged && review.trim().length > 0) {
      const aiResult = await this.moderationService.auditReviewWithAI(review);
      if (aiResult.isFlagged) {
        isFlagged = true;
        flaggedReason = aiResult.reason || 'AI: Vi phạm nội quy';
      }
    }

    // Determine moderationStatus
    let moderationStatus = 'reviewed';
    if (isFlagged || user.isCommentModerated) {
      moderationStatus = 'pending';
    }

    // Handle user violation statistics & locks if a violation is newly detected
    if (isFlagged) {
      user.violationCount += 1;
      if (user.violationCount >= 5) {
        user.commentLockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Lock 7 days
      } else if (user.violationCount >= 3) {
        user.isCommentModerated = true; // Flag for future manual reviews
      }
      await this.userRepo.save(user);
    }

    let ratingObj = await this.ratingRepo.findOne({
      where: { userId, recipeId },
    });

    if (ratingObj) {
      ratingObj.rating = rating;
      ratingObj.review = censoredReview;
      ratingObj.originalReview = review;
      ratingObj.isFlagged = isFlagged;
      ratingObj.flaggedWords = flaggedWords;
      ratingObj.flaggedReason = flaggedReason;
      ratingObj.moderationStatus = moderationStatus;
    } else {
      ratingObj = this.ratingRepo.create({
        userId,
        recipeId,
        rating,
        review: censoredReview,
        originalReview: review,
        isFlagged,
        flaggedWords,
        flaggedReason,
        moderationStatus,
      });
    }

    const savedRating = await this.ratingRepo.save(ratingObj);

    // Send Personal Notification if not self-action and approved
    if (recipe.submittedBy && moderationStatus === 'reviewed') {
      try {
        const actorName = user.fullName || 'Ai đó';
        if (review && review.trim().length > 0) {
          await this.notificationService.createNotification(
            recipe.submittedBy,
            userId,
            recipeId,
            'COMMENT_POST',
            `${actorName} đã bình luận bài viết của bạn.`
          );
        } else {
          await this.notificationService.createNotification(
            recipe.submittedBy,
            userId,
            recipeId,
            'RATE_POST',
            `${actorName} đã đánh giá bài viết của bạn ${rating} sao.`
          );
        }
      } catch (err: any) {
        this.logger.error('Failed to create personal notification:', err.message);
      }
    }

    // Create AdminNotification if flagged
    if (isFlagged) {
      try {
        const notification = this.notificationRepo.create({
          title: 'Phát hiện bình luận chứa nội dung không phù hợp',
          message: `Người dùng "${user.fullName}" đã gửi một bình luận vi phạm chính sách nội dung trên món ăn "${recipe.name}".\n\nNội dung gốc: "${review}"\nNội dung đã che: "${censoredReview}"\nLý do gắn cờ: ${flaggedReason}`,
          type: 'review_violation',
          reviewId: savedRating.id,
          userId: user.id,
          isRead: false,
        });
        await this.notificationRepo.save(notification);
      } catch (err: any) {
        this.logger.error('Failed to create admin notification:', err.message);
      }
    }

    return savedRating;
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

    if (currentUserId) {
      qb.andWhere(
        '(rating.moderationStatus = :status OR rating.userId = :userId)',
        { status: 'reviewed', userId: currentUserId }
      );
    } else {
      qb.andWhere('rating.moderationStatus = :status', { status: 'reviewed' });
    }

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
        originalReview: r.originalReview,
        isFlagged: r.isFlagged,
        moderationStatus: r.moderationStatus,
        createdAt: r.createdAt,
        user: {
          id: r.user?.id,
          fullName: r.user?.fullName,
          avatarUrl: r.user?.avatarUrl,
        },
        replies: (r.replies || [])
          .filter(rep => rep.moderationStatus === 'reviewed' || rep.userId === currentUserId)
          .map(rep => ({
            id: rep.id,
            review: rep.review,
            createdAt: rep.createdAt,
            user: {
              id: rep.user?.id,
              fullName: rep.user?.fullName,
              avatarUrl: rep.user?.avatarUrl,
            }
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

    const ratingObj = await this.ratingRepo.findOne({ where: { id: ratingId } });
    if (!ratingObj) {
      throw new NotFoundException('Không tìm thấy bình luận đánh giá.');
    }

    if (ratingObj.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bình luận này.');
    }

    // 1. Fetch user to check constraints
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    // Check if user is locked out
    if (user.commentLockedUntil && new Date() < user.commentLockedUntil) {
      const lockDate = new Date(user.commentLockedUntil).toLocaleString('vi-VN');
      throw new ForbiddenException(`Tài khoản của bạn tạm thời bị khóa quyền bình luận đến ${lockDate} do vi phạm nhiều lần.`);
    }

    const recipe = await this.recipeRepo.findOne({ where: { id: ratingObj.recipeId } });

    // 2. Perform Keyword and AI moderation
    let isFlagged = false;
    let flaggedReason = '';
    let flaggedWords = '';
    let censoredReview = review;

    const keywordResult = this.moderationService.filterBadWords(review);
    if (keywordResult.isViolating) {
      isFlagged = true;
      censoredReview = keywordResult.censoredText;
      flaggedWords = keywordResult.matchedWords.join(', ');
      flaggedReason = `Từ ngữ nhạy cảm: ${flaggedWords}`;
    }

    if (!isFlagged && review.trim().length > 0) {
      const aiResult = await this.moderationService.auditReviewWithAI(review);
      if (aiResult.isFlagged) {
        isFlagged = true;
        flaggedReason = aiResult.reason || 'AI: Vi phạm nội quy';
      }
    }

    let moderationStatus = 'reviewed';
    if (isFlagged || user.isCommentModerated) {
      moderationStatus = 'pending';
    }

    if (isFlagged) {
      user.violationCount += 1;
      if (user.violationCount >= 5) {
        user.commentLockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      } else if (user.violationCount >= 3) {
        user.isCommentModerated = true;
      }
      await this.userRepo.save(user);
    }

    ratingObj.rating = rating;
    ratingObj.review = censoredReview;
    ratingObj.originalReview = review;
    ratingObj.isFlagged = isFlagged;
    ratingObj.flaggedWords = flaggedWords;
    ratingObj.flaggedReason = flaggedReason;
    ratingObj.moderationStatus = moderationStatus;

    const savedRating = await this.ratingRepo.save(ratingObj);

    if (isFlagged) {
      try {
        const notification = this.notificationRepo.create({
          title: 'Phát hiện bình luận chỉnh sửa chứa nội dung không phù hợp',
          message: `Người dùng "${user.fullName}" đã sửa bình luận vi phạm chính sách nội dung trên món ăn "${recipe?.name || 'món ăn'}".\n\nNội dung gốc: "${review}"\nNội dung đã che: "${censoredReview}"\nLý do gắn cờ: ${flaggedReason}`,
          type: 'review_violation',
          reviewId: savedRating.id,
          userId: user.id,
          isRead: false,
        });
        await this.notificationRepo.save(notification);
      } catch (err: any) {
        this.logger.error('Failed to create admin notification:', err.message);
      }
    }

    return savedRating;
  }

  async deleteRating(
    userId: string,
    userRole: string,
    ratingId: string,
  ): Promise<{ message: string }> {
    const ratingObj = await this.ratingRepo.findOne({ where: { id: ratingId } });
    if (!ratingObj) {
      throw new NotFoundException('Không tìm thấy bình luận đánh giá.');
    }

    if (ratingObj.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Bạn không có quyền xóa bình luận này.');
    }

    await this.ratingRepo.remove(ratingObj);
    return { message: 'Đã xóa bình luận đánh giá thành công.' };
  }

  async getAverageRatingForRecipe(recipeId: string): Promise<{ average: number; count: number }> {
    const result = await this.ratingRepo
      .createQueryBuilder('rating')
      .select('AVG(rating.rating)', 'avg')
      .addSelect('COUNT(rating.id)', 'count')
      .where('rating.recipeId = :recipeId', { recipeId })
      .andWhere('rating.moderationStatus = :status', { status: 'reviewed' })
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

    const parentRating = await this.ratingRepo.findOne({ where: { id: parentId } });
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

    if (user.commentLockedUntil && new Date() < user.commentLockedUntil) {
      const lockDate = new Date(user.commentLockedUntil).toLocaleString('vi-VN');
      throw new ForbiddenException(`Tài khoản của bạn tạm thời bị khóa quyền bình luận đến ${lockDate} do vi phạm nhiều lần.`);
    }

    // 2. Perform Keyword and AI moderation
    let isFlagged = false;
    let flaggedReason = '';
    let flaggedWords = '';
    let censoredReview = review;

    const keywordResult = this.moderationService.filterBadWords(review);
    if (keywordResult.isViolating) {
      isFlagged = true;
      censoredReview = keywordResult.censoredText;
      flaggedWords = keywordResult.matchedWords.join(', ');
      flaggedReason = `Từ ngữ nhạy cảm: ${flaggedWords}`;
    }

    if (!isFlagged && review.trim().length > 0) {
      const aiResult = await this.moderationService.auditReviewWithAI(review);
      if (aiResult.isFlagged) {
        isFlagged = true;
        flaggedReason = aiResult.reason || 'AI: Vi phạm nội quy';
      }
    }

    let moderationStatus = 'reviewed';
    if (isFlagged || user.isCommentModerated) {
      moderationStatus = 'pending';
    }

    if (isFlagged) {
      user.violationCount += 1;
      if (user.violationCount >= 5) {
        user.commentLockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      } else if (user.violationCount >= 3) {
        user.isCommentModerated = true;
      }
      await this.userRepo.save(user);
    }

    const reply = this.ratingRepo.create({
      recipeId,
      userId,
      rating: null,
      parentId,
      review: censoredReview,
      originalReview: review,
      isFlagged,
      flaggedWords,
      flaggedReason,
      moderationStatus,
    });

    const savedReply = await this.ratingRepo.save(reply);

    // Send Personal Notification for REPLY_COMMENT
    if (parentRating.userId && moderationStatus === 'reviewed') {
      try {
        const actorName = user.fullName || 'Ai đó';
        const isRating = parentRating.rating !== null && parentRating.rating !== undefined;
        const message = isRating
          ? `${actorName} đã trả lời đánh giá của bạn.`
          : `${actorName} đã phản hồi bình luận của bạn.`;
        await this.notificationService.createNotification(
          parentRating.userId,
          userId,
          recipeId,
          'REPLY_COMMENT',
          message
        );
      } catch (err: any) {
        this.logger.error('Failed to create personal reply notification:', err.message);
      }
    }

    // Create AdminNotification if flagged
    if (isFlagged) {
      try {
        const notification = this.notificationRepo.create({
          title: 'Phát hiện phản hồi bình luận chứa nội dung không phù hợp',
          message: `Người dùng "${user.fullName}" đã gửi một phản hồi vi phạm chính sách nội dung trên món ăn "${recipe.name}".\n\nNội dung gốc: "${review}"\nNội dung đã che: "${censoredReview}"\nLý do gắn cờ: ${flaggedReason}`,
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

    return savedReply;
  }

  // ==================== ADMIN MODERATION METHODS ====================
  async getAdminNotifications(): Promise<{ data: AdminNotification[]; unreadCount: number }> {
    const notifications = await this.notificationRepo.find({
      relations: ['review', 'review.recipe', 'user'],
      order: { createdAt: 'DESC' },
    });
    const unreadCount = await this.notificationRepo.count({ where: { isRead: false } });
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
    const review = await this.ratingRepo.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Không tìm thấy bình luận.');
    }
    review.isFlagged = false;
    review.moderationStatus = 'reviewed';
    const saved = await this.ratingRepo.save(review);

    const notification = await this.notificationRepo.findOne({ where: { reviewId } });
    if (notification) {
      notification.isRead = true;
      await this.notificationRepo.save(notification);
    }
    return saved;
  }

  async rejectReview(reviewId: string): Promise<RecipeRating> {
    const review = await this.ratingRepo.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Không tìm thấy bình luận.');
    }
    review.moderationStatus = 'removed';
    const saved = await this.ratingRepo.save(review);

    const notification = await this.notificationRepo.findOne({ where: { reviewId } });
    if (notification) {
      notification.isRead = true;
      await this.notificationRepo.save(notification);
    }
    return saved;
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
        recipe: r.recipe ? {
          id: r.recipe.id,
          name: r.recipe.name,
          imageUrl: r.recipe.imageUrl,
        } : null,
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
