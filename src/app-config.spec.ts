import type { INestApplication } from '@nestjs/common';
import { configureNestApp } from './app-config';

describe('configureNestApp CORS', () => {
  const originalClientUrl = process.env.CLIENT_URL;
  const originalCorsOrigins = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (originalClientUrl === undefined) {
      delete process.env.CLIENT_URL;
    } else {
      process.env.CLIENT_URL = originalClientUrl;
    }

    if (originalCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = originalCorsOrigins;
    }
  });

  it('allows configured Expo origins without allowing arbitrary LAN origins', () => {
    process.env.CLIENT_URL = 'https://web.example';
    process.env.CORS_ORIGINS = 'http://192.168.1.20:8082';

    const enableCors = jest.fn();
    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ set: jest.fn() }),
      }),
      use: jest.fn(),
      enableCors,
      useGlobalPipes: jest.fn(),
    } as unknown as INestApplication;
    const consoleLog = jest.spyOn(console, 'log').mockImplementation();

    try {
      configureNestApp(app);

      const options = enableCors.mock.calls[0][0] as {
        origin: (
          requestOrigin: string,
          callback: (error: Error | null, isAllowed: boolean) => void,
        ) => void;
      };
      const checkOrigin = (origin: string) => {
        const callback = jest.fn();
        options.origin(origin, callback);
        return callback.mock.calls[0];
      };

      expect(checkOrigin('https://web.example')).toEqual([null, true]);
      expect(checkOrigin('http://192.168.1.20:8082')).toEqual([null, true]);
      expect(checkOrigin('http://192.168.1.21:8082')).toEqual([null, false]);
    } finally {
      consoleLog.mockRestore();
    }
  });
});
