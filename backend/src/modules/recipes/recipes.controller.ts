import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  Body,
  Header,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthGuard } from '@nestjs/passport';
import { RecipesService } from './recipes.service';
import { RecipeModerationService } from './recipe-moderation.service';
import { RecipeRatingService } from './recipe-rating.service';
import { CreateRecipeDto, RejectRecipeDto } from './dto/create-recipe.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly recipesService: RecipesService,
    private readonly recipeModerationService: RecipeModerationService,
    private readonly recipeRatingService: RecipeRatingService,
  ) {}

  // ==================== PUBLIC ====================

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('mealType') mealType?: string,
    @Query('maxCookingTime') maxCookingTime?: number,
    @Query('minCalories') minCalories?: number,
    @Query('maxCalories') maxCalories?: number,
    @Query('region') region?: string,
    @Query('sort') sort?: string,
  ) {
    const userId = this.getUserIdFromRequest(req);
    return this.recipesService.findAll(
      {
        page,
        limit,
        search,
        mealType,
        maxCookingTime,
        minCalories,
        maxCalories,
        region,
        sort,
      },
      userId,
    );
  }

  // ==================== ADMIN: STATS ====================

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Get('admin/stats')
  getStats() {
    return this.recipesService.getStats();
  }

  // ==================== ADMIN: CRUD ====================

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Get('admin/all')
  adminFindAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.recipesService.findAll({
      page,
      limit,
      search,
      status: status || undefined,
    });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('admin/create')
  adminCreate(@Body() dto: CreateRecipeDto, @Request() req) {
    return this.recipesService.adminCreate(dto, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Put('admin/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: CreateRecipeDto) {
    return this.recipesService.adminUpdate(id, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Delete('admin/:id')
  adminDelete(@Param('id') id: string) {
    return this.recipesService.adminDelete(id);
  }

  // ==================== ADMIN: MODERATION ====================

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  @Get('admin/pending')
  getPending(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.recipesService.getPending(page, limit);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('admin/:id/approve')
  approve(@Param('id') id: string, @Request() req) {
    return this.recipesService.approve(id, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('admin/:id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectRecipeDto,
    @Request() req,
  ) {
    return this.recipesService.reject(id, dto.reason, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Get('admin/moderation/:recipeId/audit')
  async getAudit(@Param('recipeId') recipeId: string) {
    let audit = await this.recipeModerationService.getAuditByRecipeId(recipeId);
    if (!audit) {
      audit = await this.recipeModerationService.auditRecipe(recipeId);
    }
    return audit;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('admin/moderation/:recipeId/audit/retry')
  async retryAudit(@Param('recipeId') recipeId: string) {
    return await this.recipeModerationService.auditRecipe(recipeId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Put('admin/:id/edit-pending')
  async editPendingRecipe(
    @Param('id') id: string,
    @Body() dto: CreateRecipeDto,
    @Request() req,
  ) {
    return this.recipesService.editPendingRecipe(id, dto, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/edit-history')
  async getEditHistory(@Param('id') id: string, @Request() req) {
    return this.recipesService.getEditHistory(id, req.user.id, req.user.role);
  }

  // ==================== USER: SUBMIT ====================

  @UseGuards(AuthGuard('jwt'))
  @Post('submit')
  userSubmit(@Body() dto: CreateRecipeDto, @Request() req) {
    return this.recipesService.userSubmit(dto, req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-submissions')
  getMySubmissions(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.recipesService.getUserSubmissions(req.user.id, {
      page,
      limit,
      status,
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('my-submissions/:id')
  updateMySubmission(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateRecipeDto,
  ) {
    return this.recipesService.updateUserSubmission(req.user.id, id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('my-submissions/:id')
  deleteMySubmission(@Request() req, @Param('id') id: string) {
    return this.recipesService.deleteUserSubmission(req.user.id, id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('my-submissions/:id/resubmit')
  resubmitMySubmission(@Request() req, @Param('id') id: string) {
    return this.recipesService.resubmitRecipe(req.user.id, id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('my-reviews')
  async getMyReviews(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return await this.recipeRatingService.getUserRatings(
      req.user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    );
  }

  // ==================== PUBLIC: DETAIL ====================

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const userId = this.getUserIdFromRequest(req);
    return this.recipesService.findOne(id, {
      userId,
      viewerKey: this.getViewerKey(req, userId),
      userAgent: this.getUserAgent(req),
    });
  }

  // ==================== RATINGS & REVIEWS ====================

  @UseGuards(AuthGuard('jwt'))
  @Post(':recipeId/ratings')
  async createRating(
    @Request() req,
    @Param('recipeId') recipeId: string,
    @Body() body: { rating: number; review?: string },
  ) {
    return await this.recipeRatingService.createOrUpdateRating(
      req.user.id,
      recipeId,
      body.rating,
      body.review || '',
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':recipeId/ratings/:parentId/replies')
  async createReply(
    @Request() req,
    @Param('recipeId') recipeId: string,
    @Param('parentId') parentId: string,
    @Body() body: { review: string },
  ) {
    return await this.recipeRatingService.createReply(
      req.user.id,
      recipeId,
      parentId,
      body.review,
    );
  }

  @Get(':recipeId/ratings')
  async getRatings(
    @Request() req,
    @Param('recipeId') recipeId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    let currentUserId: string | undefined;
    try {
      const authHeader = req.headers?.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const payloadPart = token.split('.')[1];
        if (payloadPart) {
          const decoded = JSON.parse(
            Buffer.from(payloadPart, 'base64').toString('utf-8'),
          );
          currentUserId = decoded.id || decoded.sub;
        }
      }
    } catch {}

    return await this.recipeRatingService.getRatingsForRecipe(
      recipeId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
      currentUserId,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':recipeId/ratings/:ratingId')
  async updateRating(
    @Request() req,
    @Param('ratingId') ratingId: string,
    @Body() body: { rating: number; review?: string },
  ) {
    return await this.recipeRatingService.updateRating(
      req.user.id,
      ratingId,
      body.rating,
      body.review || '',
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':recipeId/ratings/:ratingId')
  async deleteRating(@Request() req, @Param('ratingId') ratingId: string) {
    return await this.recipeRatingService.deleteRating(
      req.user.id,
      req.user.role,
      ratingId,
    );
  }

  private getUserIdFromRequest(req: any): string | undefined {
    try {
      const authHeader = req.headers?.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const payloadPart = token.split('.')[1];
        if (payloadPart) {
          const decoded = JSON.parse(
            Buffer.from(payloadPart, 'base64').toString('utf-8'),
          );
          return decoded.id || decoded.sub;
        }
      }
    } catch {}

    return undefined;
  }

  private getViewerKey(req: any, userId?: string): string {
    if (userId) return `user:${userId}`;

    const ip = this.getClientIp(req);
    const userAgent = this.getUserAgent(req) || 'unknown';
    const hash = createHash('sha256')
      .update(`${ip}|${userAgent}`)
      .digest('hex');

    return `anon:${hash}`;
  }

  private getClientIp(req: any): string {
    const forwardedFor = req.headers?.['x-forwarded-for'];
    if (Array.isArray(forwardedFor)) return forwardedFor[0] || 'unknown';
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || 'unknown';
    }

    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private getUserAgent(req: any): string | null {
    const userAgent = req.headers?.['user-agent'];
    if (Array.isArray(userAgent)) return userAgent.join(' ');
    return userAgent || null;
  }
}
