import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://187.127.133.141:3000',
  'http://findmypropertys.com',
  'http://www.findmypropertys.com',
  'https://findmypropertys.com',
  'https://www.findmypropertys.com',
  'http://192.168.1.20:8081',
  'http://localhost:8081',
];

function getAllowedOrigins(): string[] {
  const configuredOrigins = [process.env.CLIENT_URL, process.env.CORS_ORIGINS]
    .filter((origins): origins is string => Boolean(origins))
    .flatMap((origins) => origins.split(','))
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const fallbackOrigins =
    configuredOrigins.length > 0
      ? []
      : ['https://real-estate-self-nu.vercel.app', 'http://localhost:5173'];

  console.log('Allowed origins:', [
    ...new Set([
      ...configuredOrigins,
      ...fallbackOrigins,
      ...LOCAL_DEV_ORIGINS,
    ]),
  ]);

  return [
    ...new Set([
      ...configuredOrigins,
      ...fallbackOrigins,
      ...LOCAL_DEV_ORIGINS,
    ]),
  ];
}

export function configureNestApp(app: INestApplication) {
  const expressApp = app.getHttpAdapter().getInstance() as {
    set?: (setting: string, val: boolean | number | string) => void;
  };
  expressApp.set?.('trust proxy', 1);

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
