import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { chunkAudioIfNeeded } from 'src/transcription/audio-chunker';
import * as path from 'path';

@Injectable()
export class AIService {
    private openai: OpenAI;
    private logger: Logger;
    constructor(private configService: ConfigService) {
        this.openai = new OpenAI({ apiKey: this.configService.get<string>('OPENAI_API_KEY') || 'placeholder-key' });
        this.logger = new Logger(AIService.name);
    }
    async generateMeetingNotes(transcript: string): Promise<string> {
        this.logger.log('Generating meeting notes from transcript:', transcript);
        const response = await this.openai.responses.create({
            model: 'gpt-5-nano',
            instructions: 'Genera anotaciones en formato markdown que resuman la transcripción de una clase universitaria que recibirás de manera completa. Si crees necesario añade información que complemente las anotaciones, pero especifica cuando una información no está en la transcripción original sino que la añades tú para complementar las anotaciones. Algo importante es que las anotaciones deben estar bien organizadas, con títulos y subtítulos claros, y que sean fáciles de leer y entender. Por ejemplo, puedes usar listas de bullet, listas enumeradas, negritas, cursivas, headings, etc.; al igual que el espaciado entre párrafos. Si el contexto lo requiere, puedes hacer referencia a conceptos o temas relevantes que no estén explícitamente mencionados en la transcripción. Asimismo, si el tema lo requiere, puedes incluir fórmulas de cualquier tipo, por ejemplo, matemáticas o simplemente ilustrativas. Si detectas que la transcripción tiene errores comparado a tu conocimiento, o si se contradicen partes de la transcripción, intenta corregir esos errores o contradicciones en las anotaciones, pero especifica cuando haces una corrección con una nota aclaratoria. Finalmente, no ofrezcas al usuario la posibilidad de solicitar más información o ayuda, simplemente entrega las anotaciones.',
            input: `Transcripción: ${transcript}`,
        });

        this.logger.log('Generated meeting notes');
        return response.output_text;
    }

    async transcribeAudio(file: any /* Express.Multer.File */): Promise<string> { // TODO: refine type when express multer types are stabilized
        this.logger.log(`Transcribing audio file: ${file?.originalname}`);
        // If multer stored file on disk, use file.path. If memory storage was used (buffer), write a temp file.
        let tempPath = file?.path;
        let cleanup = false;
        if (!tempPath) {
            if (!file?.buffer) {
                throw new Error('Uploaded file missing path and buffer');
            }
            tempPath = `./tmp-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
            await fs.promises.writeFile(tempPath, file.buffer);
            cleanup = true;
        }
        try {
            // Attempt chunking if file exceeds 25MB limit
            let chunkInfo: any = null;
            try {
                chunkInfo = await chunkAudioIfNeeded(tempPath, 25 * 1024 * 1024);
            } catch (e: any) {
                // If missing ffmpeg/ffprobe and file exceeds size limit, provide clearer guidance
                if (/Missing ffmpeg\/ffprobe binaries/i.test(e?.message)) {
                    this.logger.error(e.message);
                    throw new Error('Server missing ffmpeg/ffprobe for large file chunking. Install ffmpeg or upload a file under 25MB.');
                }
                throw e;
            }
            if (!chunkInfo) {
                const response = await this.openai.audio.transcriptions.create({
                    file: fs.createReadStream(tempPath),
                    model: 'gpt-4o-mini-transcribe',
                });
                this.logger.log('Transcription completed (single)');
                return (response as any).text || (response as any).output_text || '';
            }
            const combined: string[] = [];
            const chunkPaths: string[] = chunkInfo.chunkPaths;
            this.logger.log(`Transcribing ${chunkPaths.length} chunks in parallel`);

            const transcriptionPromises = chunkPaths.map((chunkPath) => {
                const base = path.basename(chunkPath);
                this.logger.log(`Starting transcription for chunk: ${base}`);
                return this.openai.audio.transcriptions
                    .create({
                        file: fs.createReadStream(chunkPath),
                        model: 'gpt-4o-mini-transcribe',
                    })
                    .then((response) => (response as any).text || (response as any).output_text || '')
                    .catch((err) => {
                        this.logger.error(`Failed transcribing chunk ${base}: ${err.message}`);
                        return '';
                    });
            });

            const results = await Promise.all(transcriptionPromises);
            for (const r of results) {
                combined.push(r);
            }

            this.logger.log('All chunks transcribed');
            return combined.join('\n');
        } finally {
            if (cleanup) {
                fs.promises.unlink(tempPath).catch(() => undefined);
            }
        }
    }
}
