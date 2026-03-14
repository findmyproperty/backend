import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

function getAllowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? '';
  const fallback = 'https://real-estate-self-nu.vercel.app,http://localhost:5173';

  return (configured || fallback)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function configureNestApp(app: INestApplication) {
  const allowedOrigins = getAllowedOrigins();

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = requestOrigin.replace(/\/+$/, '');
      callback(null, allowedOrigins.includes(normalizedOrigin));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
