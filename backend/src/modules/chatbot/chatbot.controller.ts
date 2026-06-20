import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatbotAIService } from './chatbot-ai.service';

@Controller('chatbot')
@UseGuards(AuthGuard('jwt'))
export class ChatbotController {
  constructor(private readonly chatbotAIService: ChatbotAIService) {}

  @Post('message')
  async sendMessage(@Req() req: any, @Body() body: { message: string }) {
    return await this.chatbotAIService.sendMessage(req.user.id, body.message);
  }

  @Get('history')
  async getHistory(@Req() req: any) {
    const history = await this.chatbotAIService.getHistory(req.user.id);
    return { data: history };
  }

  @Delete('history')
  async clearHistory(@Req() req: any) {
    await this.chatbotAIService.clearHistory(req.user.id);
    return { message: 'Đã xóa lịch sử trò chuyện thành công' };
  }

  @Post('action-log')
  async logAction(@Req() req: any, @Body() body: any) {
    const log = await this.chatbotAIService.logUserAction(req.user.id, body);
    return { data: log };
  }
}
