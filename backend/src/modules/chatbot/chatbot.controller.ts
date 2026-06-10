import { Controller, Post, Get, Delete, Body, UseGuards, Req, Query, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatbotAIService } from './chatbot-ai.service';
import { TtsService } from './tts.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import * as express from 'express';

@Controller('chatbot')
@UseGuards(AuthGuard('jwt'))
export class ChatbotController {
  constructor(
    private readonly chatbotAIService: ChatbotAIService,
    private readonly ttsService: TtsService,
  ) {}

  @Get('tts')
  async getTts(
    @Query('text') text: string,
    @Res() res: express.Response,
  ) {
    if (!text) {
      return res.status(400).json({ error: 'Text query parameter is required' });
    }
    const audioBuffer = await this.ttsService.generateSpeech(text);
    if (!audioBuffer) {
      return res.status(400).json({ error: 'No TTS provider configured or generation failed' });
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    return res.end(audioBuffer);
  }

  @Post('message')
  async sendMessage(
    @Req() req: any,
    @Body() body: { message: string },
  ) {
    return await this.chatbotAIService.sendMessage(req.user.id, body.message);
  }

  @Post('voice')
  async sendVoiceMessage(
    @Req() req: any,
    @Body() body: { message: string; durationMs: number },
  ) {
    return await this.chatbotAIService.sendVoiceMessage(req.user.id, body.message, body.durationMs || 0);
  }

  @Get('voice/stats')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async getVoiceStats() {
    const stats = await this.chatbotAIService.getVoiceStats();
    return { data: stats };
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
  async logAction(
    @Req() req: any,
    @Body() body: any,
  ) {
    const log = await this.chatbotAIService.logUserAction(req.user.id, body);
    return { data: log };
  }
}
