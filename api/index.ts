import express from 'express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureNestApp } from '../src/app-config';

const expressApp = express();
let cachedHandler:
  | ((req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown)
  | null = null;

async function getHandler() {
  if (cachedHandler) return cachedHandler;

  const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  configureNestApp(nestApp);
  await nestApp.init();

  cachedHandler = serverless(expressApp);
  return cachedHandler;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestHandler = await getHandler();
  return requestHandler(req, res);
}
