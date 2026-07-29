import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
    // Allowed frontend origins. Extra origins can be added via the CORS_ORIGINS env var
    // (comma-separated) without a code change.
    const defaultOrigins = [
      'http://localhost:3000',
      'https://crm-frontend-xi-three.vercel.app',
      'https://ip3-crm.ch',
      'https://www.ip3-crm.ch',
    ];
    const envOrigins = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));
    const normalize = (o: string) => o.replace(/\/$/, '');
    const allowSet = new Set(allowedOrigins.map(normalize));
    app.enableCors({
      // Allow requests with no Origin (curl/health checks) and any whitelisted origin (trailing slash tolerated).
      origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
        if (!origin || allowSet.has(normalize(origin))) cb(null, true);
        else cb(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true,
    });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT || 3001);
}
bootstrap();
