import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { CategoryServiceMapping } from './category-service-mapping.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /**
   * Unique slug for the category.
   * We use an explicitly named index to avoid auto-generated hash names
   * that can cause "Duplicate key name" errors on synchronize if the DB
   * state gets out of sync.
   */
  @Index('IDX_categories_slug', { unique: true })
  @Column({ type: 'varchar', length: 120 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(
    () => CategoryServiceMapping,
    (mapping) => mapping.category,
    { cascade: true },
  )
  mappings?: CategoryServiceMapping[];

  /**
   * Populated from mappings for backward compatibility.
   * Primary service this category is mapped to (or null).
   */
  service?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
