import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
    app.enableCors({
      origin: [
        'http://localhost:3000',
        'https://crm-frontend-xi-three.vercel.app',
      ],
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
