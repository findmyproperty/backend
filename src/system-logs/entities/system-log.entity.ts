import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum LogLevel {
  INFO = 'info',
  ERROR = 'error',
  WARN = 'warn',
  DEBUG = 'debug',
}

@Entity('system_logs')
export class SystemLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: LogLevel,
    default: LogLevel.INFO,
  })
  level: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'json', nullable: true })
  context: any;

  @Column({ type: 'varchar', nullable: true })
  source: string; // e.g., 'AuthService', 'PropertiesController'

  @Column({ type: 'varchar', nullable: true })
  method: string; // e.g., 'GET', 'POST'

  @Column({ type: 'varchar', nullable: true })
  url: string;

  @Column({ type: 'text', nullable: true })
  stack: string; // For errors

  @Column({ type: 'int', nullable: true })
  userId: number;

  @Column({ type: 'varchar', nullable: true })
  ip: string;

  @CreateDateColumn()
  timestamp: Date;
}
