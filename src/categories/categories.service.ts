import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CategoryServiceMapping } from './entities/category-service-mapping.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ServiceType } from '../service-requests/entities/service-request.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(CategoryServiceMapping)
    private readonly mappingRepository: Repository<CategoryServiceMapping>,
  ) {}

  async findAll(): Promise<Category[]> {
    const categories = await this.categoryRepository.find({
      relations: ['mappings'],
      order: { name: 'ASC' },
    });

    // For backward compat with current frontend (expects `service`), attach first mapping
    return categories.map((cat) => {
      const firstMapping = cat.mappings?.[0];
      return {
        ...cat,
        commissionPercent: Number(cat.commissionPercent) || 0,
        service: firstMapping ? firstMapping.service : null,
      } as Category;
    });
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['mappings'],
    });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    const firstMapping = category.mappings?.[0];
    return {
      ...category,
      commissionPercent: Number(category.commissionPercent) || 0,
      service: firstMapping ? firstMapping.service : null,
    } as Category;
  }

  /**
   * Match a service-request subtype (slug/name/option value) to an active
   * category mapped to the given service type.
   */
  async findByServiceAndSubtype(
    serviceType: ServiceType,
    subtypeQuery: string,
  ): Promise<Category | null> {
    const q = subtypeQuery.trim().toLowerCase();
    if (!q) return null;

    const mappings = await this.mappingRepository.find({
      where: { service: serviceType, isActive: true },
      select: ['categoryId'],
    });
    if (mappings.length === 0) return null;

    const categories = await this.categoryRepository.findBy({
      id: In(mappings.map((m) => m.categoryId)),
      isActive: true,
    });
    if (categories.length === 0) return null;

    const normalize = (value: string) =>
      value
        .toLowerCase()
        .trim()
        .replace(/_/g, '-')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    const qNorm = normalize(q);
    const qUnderscore = qNorm.replace(/-/g, '_');

    let matched = categories.find((c) => {
      const slug = c.slug.toLowerCase();
      const name = c.name.toLowerCase();
      const slugNorm = normalize(c.slug);
      const nameNorm = normalize(c.name);
      return (
        slug === q ||
        name === q ||
        slugNorm === qNorm ||
        nameNorm === qNorm ||
        slugNorm.replace(/-/g, '_') === qUnderscore ||
        nameNorm.replace(/-/g, '_') === qUnderscore
      );
    });
    if (matched) return matched;

    const queryWords = qNorm.split(/[^a-z0-9]+/).filter(Boolean);
    if (queryWords.length > 0) {
      matched = categories.find((c) => {
        const nameLower = c.name.toLowerCase();
        const slugLower = c.slug.toLowerCase();
        return queryWords.every(
          (word) => nameLower.includes(word) || slugLower.includes(word),
        );
      });
      if (matched) return matched;
    }

    return null;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.categoryRepository.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException('A category with this slug already exists');
    }

    const category = this.categoryRepository.create({
      name: dto.name.trim(),
      slug,
      description: dto.description?.trim() ?? null,
      isActive: dto.isActive ?? true,
      commissionPercent:
        dto.commissionPercent !== undefined &&
        Number.isFinite(Number(dto.commissionPercent))
          ? Number(dto.commissionPercent)
          : 0,
    });

    const savedCategory = await this.categoryRepository.save(category);

    // Handle mapping via new table
    if (dto.service) {
      const mapping = this.mappingRepository.create({
        category: savedCategory,
        service: dto.service,
        isActive: true,
      });
      await this.mappingRepository.save(mapping);
    }

    return this.findOne(savedCategory.id);
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    if (dto.name !== undefined) {
      category.name = dto.name.trim();
    }

    if (dto.slug !== undefined) {
      const newSlug = dto.slug.trim().toLowerCase();
      if (newSlug !== category.slug) {
        const existing = await this.categoryRepository.findOne({
          where: { slug: newSlug },
        });
        if (existing) {
          throw new ConflictException('A category with this slug already exists');
        }
        category.slug = newSlug;
      }
    }

    if (dto.description !== undefined) {
      category.description = dto.description ? dto.description.trim() : null;
    }

    if (dto.isActive !== undefined) {
      category.isActive = dto.isActive;
    }

    if (dto.commissionPercent !== undefined) {
      category.commissionPercent = Number(dto.commissionPercent);
    }

    await this.categoryRepository.save(category);

    // Handle service mapping via new table (replace existing mappings for simplicity)
    if (dto.service !== undefined) {
      // Remove existing mappings for this category
      await this.mappingRepository.delete({ categoryId: id });

      if (dto.service) {
        const mapping = this.mappingRepository.create({
          categoryId: id,
          service: dto.service,
          isActive: true,
        });
        await this.mappingRepository.save(mapping);
      }
    }

    return this.findOne(id);
  }

  async remove(id: number): Promise<{ message: string }> {
    const category = await this.findOne(id);
    await this.categoryRepository.remove(category);
    return { message: 'Category deleted successfully' };
  }
}
