import { Body, Controller, Post, BadRequestException, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';

type NotesDto = {
  transcript?: string;
};

@Controller('notes')
export class NotesController {
  @Post()
  @UseGuards(JwtGuard)
  generate(@Body() body: NotesDto) {
    if (!body.transcript) throw new BadRequestException('transcript is required');
    // Placeholder: create markdown notes
    const markdown = `# Meeting Notes\n\n## Summary\n- Auto-generated notes from transcript.\n\n## Key Points\n- ${body.transcript.substring(0, 80)}...\n\n## Action Items\n- [ ] Example action item`;
    return { markdown };
  }
}
