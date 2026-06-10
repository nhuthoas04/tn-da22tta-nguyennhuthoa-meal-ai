import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationService {
    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepo: Repository<Notification>,
    ) { }

    /**
     * Create a notification.
     * Only creates if recipient is not the actor themselves.
     */
    async createNotification(
        userId: string,
        actorId: string | null,
        postId: string | null,
        type: string,
        message: string,
    ): Promise<Notification | null> {
        // Prevent sending notification to self
        if (userId === actorId) {
            return null;
        }

        const notification = this.notificationRepo.create({
            userId,
            actorId,
            postId,
            type,
            message,
            isRead: false,
        });

        return await this.notificationRepo.save(notification);
    }

    /**
     * Get all notifications for a user, paginated.
     */
    async getNotifications(userId: string, page = 1, limit = 20) {
        const [data, total] = await this.notificationRepo.findAndCount({
            where: { userId },
            relations: ['actor', 'post'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            data: data.map(notif => ({
                id: notif.id,
                type: notif.type,
                message: notif.message,
                isRead: notif.isRead,
                createdAt: notif.createdAt,
                actor: notif.actor
                    ? {
                        id: notif.actor.id,
                        fullName: notif.actor.fullName,
                        avatarUrl: notif.actor.avatarUrl,
                    }
                    : null,
                post: notif.post
                    ? {
                        id: notif.post.id,
                        name: notif.post.name,
                    }
                    : null,
            })),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Count unread notifications for a user.
     */
    async getUnreadCount(userId: string): Promise<{ count: number }> {
        const count = await this.notificationRepo.count({
            where: { userId, isRead: false },
        });
        return { count };
    }

    /**
     * Mark a specific notification as read.
     */
    async markAsRead(userId: string, notificationId: string): Promise<Notification> {
        const notification = await this.notificationRepo.findOne({
            where: { id: notificationId, userId },
        });

        if (!notification) {
            throw new NotFoundException('Không tìm thấy thông báo.');
        }

        notification.isRead = true;
        return await this.notificationRepo.save(notification);
    }

    /**
     * Mark all notifications of a user as read.
     */
    async markAllAsRead(userId: string): Promise<{ message: string }> {
        await this.notificationRepo.update(
            { userId, isRead: false },
            { isRead: true }
        );
        return { message: 'Đã đánh dấu đọc tất cả thông báo.' };
    }
}
