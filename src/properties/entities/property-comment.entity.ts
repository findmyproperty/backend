import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('property_comments')
export class PropertyComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  propertyId: number;

  @Column({ type: 'int' })
  userId: number;

  @Column('text')
  body: string;

  @CreateDateColumn()
  createdAt: Date;
}
