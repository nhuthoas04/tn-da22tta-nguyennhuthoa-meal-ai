import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(private readonly configService: ConfigService) {}

  async generateSpeech(text: string): Promise<Buffer | null> {
    const azureKey = this.configService.get<string>('AZURE_SPEECH_KEY') || process.env.AZURE_SPEECH_KEY;
    const azureRegion = this.configService.get<string>('AZURE_SPEECH_REGION') || process.env.AZURE_SPEECH_REGION || 'southeastasia';
    
    const elevenLabsKey = this.configService.get<string>('ELEVENLABS_API_KEY') || process.env.ELEVENLABS_API_KEY;
    const elevenLabsVoiceId = this.configService.get<string>('ELEVENLABS_VOICE_ID') || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

    // 1. Try Azure Speech Service (Preferred for Vietnamese Neural Voice)
    if (azureKey) {
      this.logger.log('Generating TTS using Azure Speech Service...');
      try {
        const escapedText = this.escapeXml(text);
        const ssml = `
          <speak version='1.0' xml:lang='vi-VN'>
            <voice xml:lang='vi-VN' xml:gender='Female' name='vi-VN-HoaiMyNeural'>
              ${escapedText}
            </voice>
          </speak>
        `.trim();

        const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': azureKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
            'User-Agent': 'MealAI',
          },
          body: ssml,
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        } else {
          const errText = await response.text();
          this.logger.warn(`Azure TTS failed: Status ${response.status} - ${errText}`);
        }
      } catch (e: any) {
        this.logger.error(`Azure TTS Exception: ${e.message}`);
      }
    }

    // 2. Try ElevenLabs Service (Alternative)
    if (elevenLabsKey) {
      this.logger.log('Generating TTS using ElevenLabs...');
      try {
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'xi-api-key': elevenLabsKey,
            'Content-Type': 'application/json',
            'accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text: text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        } else {
          const errText = await response.text();
          this.logger.warn(`ElevenLabs TTS failed: Status ${response.status} - ${errText}`);
        }
      } catch (e: any) {
        this.logger.error(`ElevenLabs TTS Exception: ${e.message}`);
      }
    }

    // Fallback: No credentials
    return null;
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}
