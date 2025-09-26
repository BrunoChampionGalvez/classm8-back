import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtGuard } from '../auth/jwt.guard';
import { TranscriptionService } from './transcription.service';
import { NotesService } from 'src/notes/notes.service';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

// Ensure uploads directory exists (relative to project root)
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

@Controller('process-audio')
export class TranscriptionController {
  constructor(
    private readonly transcriptionService: TranscriptionService,
    private readonly notesService: NotesService,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.random().toString(36).slice(2);
            cb(null, unique + path.extname(file.originalname));
        },
      }),
      fileFilter: (_req, file, cb) => {
        // Allow m4a, wav, mp3, aac, caf, ogg
        const ok = /\.(m4a|wav|mp3|aac|caf|ogg)$/i.test(file.originalname);
        cb(ok ? null : new BadRequestException('Unsupported file type'), ok);
      },
      // Increase to 300 MB (~ large 2h compressed audio). Adjust as needed.
      limits: { fileSize: 300 * 1024 * 1024 },
    }),
  )
  async processAudio(@UploadedFile() file?: any) {
    if (!file) throw new BadRequestException('No audio file uploaded under field "audio"');
    try {
      const transcript = await this.transcriptionService.transcribeAudio(file);
      const notesPart = await this.notesService.generateMeetingNotes(transcript);
      return { transcript, notes: notesPart };
    } catch (err: any) {
      // Log raw error server-side
      // eslint-disable-next-line no-console
      console.error('Error processing audio:', err);
      throw new InternalServerErrorException(err?.message || 'Failed to process audio');
    }
  }
}
