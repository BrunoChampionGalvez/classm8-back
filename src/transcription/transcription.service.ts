import { Injectable } from "@nestjs/common";
import { AIService } from "src/ai/ai.service";

@Injectable()
export class TranscriptionService {
  constructor(
    private readonly aiService: AIService,
  ) {}
  async transcribeAudio(file: any /* Express.Multer.File */): Promise<string> { // TODO: refine type when express multer types are stabilized
    // Placeholder: simulate audio transcription
    return this.aiService.transcribeAudio(file);
  }
}
