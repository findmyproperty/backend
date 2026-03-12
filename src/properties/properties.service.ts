import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Property } from './entities/property.entity';

@Injectable()
export class PropertiesService {
    constructor(
        @InjectRepository(Property)
        private readonly propertyRepository: Repository<Property>,
    ) { }

    async create(createPropertyDto: CreatePropertyDto): Promise<Property> {
        const property = this.propertyRepository.create(createPropertyDto);
        return await this.propertyRepository.save(property);
    }

    async findAll(): Promise<Property[]> {
        return await this.propertyRepository.find();
    }

    async findOne(id: number): Promise<Property> {
        const property = await this.propertyRepository.findOne({ where: { id } });
        if (!property) {
            throw new NotFoundException(`Property with ID ${id} not found`);
        }
        return property;
    }

    async update(
        id: number,
        updatePropertyDto: UpdatePropertyDto,
    ): Promise<Property> {
        const property = await this.findOne(id);
        const updatedProperty = Object.assign(property, updatePropertyDto);
        return await this.propertyRepository.save(updatedProperty);
    }

    async remove(id: number): Promise<void> {
        const result = await this.propertyRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Property with ID ${id} not found`);
        }
    }
}
