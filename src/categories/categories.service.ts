import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CategoryServiceMapping } from './entities/category-service-mapping.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

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
      service: firstMapping ? firstMapping.service : null,
    } as Category;
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
