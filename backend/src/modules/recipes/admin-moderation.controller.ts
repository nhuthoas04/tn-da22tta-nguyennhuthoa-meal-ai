import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RecipeRatingService } from './recipe-rating.service';

@Controller('admin/moderation')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminModerationController {
  constructor(private readonly ratingService: RecipeRatingService) {}

  @Get('notifications')
  async getNotifications() {
    return await this.ratingService.getAdminNotifications();
  }

  @Patch('notifications/:id/read')
  async markAsRead(@Param('id') id: string) {
    return await this.ratingService.markNotificationAsRead(id);
  }

  @Post('reviews/:reviewId/approve')
  async approveReview(@Param('reviewId') reviewId: string) {
    return await this.ratingService.approveReview(reviewId);
  }

  @Post('reviews/:reviewId/reject')
  async rejectReview(@Param('reviewId') reviewId: string) {
    return await this.ratingService.rejectReview(reviewId);
  }

  @Patch('users/:userId/unlock')
  async unlockUser(@Param('userId') userId: string) {
    return await this.ratingService.unlockUser(userId);
  }
}
