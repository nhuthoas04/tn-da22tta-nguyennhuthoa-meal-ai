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
import { ChatbotCommandService } from './chatbot-command.service';
import { CHATBOT_INTENTS, ChatbotEntities, ChatbotIntent } from './chatbot.types';
import { BadRequestException } from '@nestjs/common';

@Controller('chatbot')
@UseGuards(AuthGuard('jwt'))
export class ChatbotController {
  constructor(
    private readonly chatbotAIService: ChatbotAIService,
    private readonly chatbotCommandService: ChatbotCommandService,
  ) {}

  @Post('message')
  async sendMessage(@Req() req: any, @Body() body: { message: string }) {
    if (!body.message?.trim()) {
      throw new BadRequestException('Tin nhắn không được để trống');
    }
    return await this.chatbotCommandService.sendMessage(
      req.user.id,
      body.message,
    );
  }

  @Post('action')
  async executeAction(
    @Req() req: any,
    @Body() body: { intent: ChatbotIntent; entities?: ChatbotEntities },
  ) {
    if (!CHATBOT_INTENTS.includes(body.intent)) {
      throw new BadRequestException('Intent không hợp lệ');
    }
    return await this.chatbotCommandService.executeAction(
      req.user.id,
      body.intent,
      body.entities || {},
    );
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
