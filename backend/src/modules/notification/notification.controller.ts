import {
    Controller, Get, Put, Param, Query, UseGuards, Request
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationService } from './notification.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationController {
    constructor(
        private readonly notificationService: NotificationService
    ) { }

    @Get()
    async getNotifications(
        @Request() req,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return await this.notificationService.getNotifications(
            req.user.id,
            page ? Number(page) : 1,
            limit ? Number(limit) : 20
        );
    }

    @Get('unread-count')
    async getUnreadCount(@Request() req) {
        return await this.notificationService.getUnreadCount(req.user.id);
    }

    @Put('mark-all-read')
    async markAllAsRead(@Request() req) {
        return await this.notificationService.markAllAsRead(req.user.id);
    }

    @Put(':id/read')
    async markAsRead(@Request() req, @Param('id') id: string) {
        return await this.notificationService.markAsRead(req.user.id, id);
    }
}
