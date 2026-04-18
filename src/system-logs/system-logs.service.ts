import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SystemLog, LogLevel } from './entities/system-log.entity';

@Injectable()
export class SystemLogsService {
  constructor(
    @InjectRepository(SystemLog)
    private readonly logRepository: Repository<SystemLog>,
  ) {}

  async log(data: Partial<SystemLog>) {
    try {
      const logEntry = this.logRepository.create(data);
      await this.logRepository.save(logEntry);
    } catch (error) {
      // Fallback to console if database logging fails to avoid infinite loops or missing critical info
      console.error('Failed to save system log to database:', error);
      console.error('Original log data:', data);
    }
  }

  async error(message: string, stack?: string, context?: any, source?: string) {
    return this.log({
      level: LogLevel.ERROR,
      message,
      stack,
      context: context as unknown,
      source,
    });
  }

  async info(message: string, context?: any, source?: string) {
    return this.log({
      level: LogLevel.INFO,
      message,
      context: context as unknown,
      source,
    });
  }

  async warn(message: string, context?: any, source?: string) {
    return this.log({
      level: LogLevel.WARN,
      message,
      context: context as unknown,
      source,
    });
  }

  async findAll(options: { limit?: number; offset?: number } = {}) {
    const { limit = 50, offset = 0 } = options;
    return this.logRepository.find({
      order: { timestamp: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Admin maintenance: delete rows matching the filter.
   * - `olderThanHours`: delete rows older than N hours.
   * - `level`: optionally restrict to one level (e.g. 'info' only).
   * - If both are omitted, deletes ALL rows (TRUNCATE-equivalent via deleteAll).
   * Returns the number of rows removed.
   */
  async clear(options: {
    olderThanHours?: number;
    level?: LogLevel;
  }): Promise<{ deleted: number }> {
    const where: Record<string, unknown> = {};
    if (options.level) where.level = options.level;
    if (options.olderThanHours && options.olderThanHours > 0) {
      const cutoff = new Date(
        Date.now() - options.olderThanHours * 60 * 60 * 1000,
      );
      where.timestamp = LessThan(cutoff);
    }

    if (Object.keys(where).length === 0) {
      // Nuclear option: remove everything
      const total = await this.logRepository.count();
      await this.logRepository.clear();
      return { deleted: total };
    }

    const result = await this.logRepository.delete(where);
    return { deleted: result.affected ?? 0 };
  }
}
