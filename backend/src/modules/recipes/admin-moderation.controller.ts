import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecipeRatingService } from './recipe-rating.service';

@Controller('admin/moderation')
@UseGuards(AuthGuard('jwt'))
export class AdminModerationController {
  constructor(private readonly ratingService: RecipeRatingService) {}

  private verifyAdmin(req: any) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Yêu cầu quyền Quản trị viên (Admin access required).');
    }
  }

  @Get('notifications')
  async getNotifications(@Request() req) {
    this.verifyAdmin(req);
    return await this.ratingService.getAdminNotifications();
  }

  @Patch('notifications/:id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    this.verifyAdmin(req);
    return await this.ratingService.markNotificationAsRead(id);
  }

  @Post('reviews/:reviewId/approve')
  async approveReview(@Request() req, @Param('reviewId') reviewId: string) {
    this.verifyAdmin(req);
    return await this.ratingService.approveReview(reviewId);
  }

  @Post('reviews/:reviewId/reject')
  async rejectReview(@Request() req, @Param('reviewId') reviewId: string) {
    this.verifyAdmin(req);
    return await this.ratingService.rejectReview(reviewId);
  }

  @Patch('users/:userId/unlock')
  async unlockUser(@Request() req, @Param('userId') userId: string) {
    this.verifyAdmin(req);
    return await this.ratingService.unlockUser(userId);
  }
}
