import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://187.127.133.141:3000'
];

function getAllowedOrigins(): string[] {
  const configured = process.env.CLIENT_URL;
  const fallback =
    'https://real-estate-self-nu.vercel.app,http://localhost:5173';

  const fromEnv = (configured || fallback)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  console.log('Allowed origins:', [
    ...new Set([...fromEnv, ...LOCAL_DEV_ORIGINS]),
  ]);

  return [...new Set([...fromEnv, ...LOCAL_DEV_ORIGINS])];
}

export function configureNestApp(app: INestApplication) {
  app.use(cookieParser());

  const allowedOrigins = getAllowedOrigins();

  app.enableCors({
    origin: (
      requestOrigin: string,
      callback: (err: Error | null, isAllowed: boolean) => void,
    ) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = requestOrigin.replace(/\/+$/, '');
      const isAllowed =
        allowedOrigins.includes(normalizedOrigin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
      callback(null, isAllowed);
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
