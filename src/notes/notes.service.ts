import { Injectable } from "@nestjs/common";
import { AIService } from "src/ai/ai.service";

@Injectable()
export class NotesService {
  constructor(
    private readonly aiService: AIService,
  ) {}

  async generateMeetingNotes(transcript: string): Promise<string> {
    return this.aiService.generateMeetingNotes(transcript);
  }
}