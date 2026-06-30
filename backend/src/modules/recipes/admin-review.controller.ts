import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RecipeRatingService } from './recipe-rating.service';

@Controller('admin/reviews')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminReviewController {
  constructor(private readonly ratingService: RecipeRatingService) {}

  @Get('flagged')
  getFlaggedReviews() {
    return this.ratingService.getFlaggedReviews();
  }

  @Delete(':id')
  deleteReview(@Param('id') id: string) {
    return this.ratingService.deleteFlaggedReview(id);
  }

  @Patch(':id/ignore')
  ignoreReview(@Param('id') id: string) {
    return this.ratingService.ignoreFlaggedReview(id);
  }
}
