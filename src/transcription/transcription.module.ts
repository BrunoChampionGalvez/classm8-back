import { Module } from '@nestjs/common';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionService } from './transcription.service';
import { AIService } from 'src/ai/ai.service';
import { NotesService } from 'src/notes/notes.service';

@Module({
  imports: [],
  controllers: [TranscriptionController],
  providers: [TranscriptionService, NotesService, AIService],
})
export class TranscriptionModule {}
