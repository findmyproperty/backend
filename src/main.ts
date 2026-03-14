import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureNestApp } from './app-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureNestApp(app);
  const port = process.env.PORT || 3005;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
