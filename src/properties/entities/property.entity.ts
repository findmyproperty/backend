import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { ListingType, PropertyType } from '../dto/create-property.dto';

@Entity()
export class Property {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column('text')
    description: string;

    @Column('decimal')
    price: number;

    @Column()
    currency: string;

    @Column({
        type: 'simple-enum',
        enum: ListingType,
    })
    listingType: ListingType;

    @Column({
        type: 'simple-enum',
        enum: PropertyType,
    })
    propertyType: PropertyType;

    @Column()
    address: string;

    @Column()
    city: string;

    @Column()
    rooms: number;

    @Column()
    bathrooms: number;

    @Column()
    areaSquareMeters: number;

    @Column()
    yearBuilt: number;

    @Column('simple-array')
    amenities: string[];

    @Column('simple-array', { nullable: true })
    imageUrls: string[];
}
