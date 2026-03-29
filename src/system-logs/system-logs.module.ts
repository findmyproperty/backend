import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemLog } from './entities/system-log.entity';
import { SystemLogsService } from './system-logs.service';
import { SystemLogsController } from './system-logs.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemLog])],
  controllers: [SystemLogsController],
  providers: [SystemLogsService],
  exports: [SystemLogsService],
})
export class SystemLogsModule {}
