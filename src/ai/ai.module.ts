import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import OpenAI from 'openai';
import { AIService } from './ai.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: OpenAI,
      useFactory: () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder-key' }),
    },
    AIService,
  ],
  exports: [AIService],
})
export class AIModule {}
