import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS for frontend at http://localhost:3001
  app.enableCors({
    origin: 'http://localhost:3001',
    credentials: false,
  });
  // Backend should listen on 3000 (frontend uses 3001)
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
