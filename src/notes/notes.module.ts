import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { AIService } from 'src/ai/ai.service';

@Module({
  controllers: [NotesController],
  providers: [NotesService, AIService],
  exports: [NotesService],
})
export class NotesModule {}
