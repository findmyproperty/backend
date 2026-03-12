import {
    IsString,
    IsNumber,
    IsEnum,
    IsArray,
    IsOptional,
    Min,
    IsUrl,
} from 'class-validator';

export enum ListingType {
    RENT = 'Rent',
    SALE = 'Sale',
    LEASE = 'Lease',
}

export enum PropertyType {
    HOUSE = 'House',
    APARTMENT = 'Apartment',
    VILLA = 'Villa',
    TOWNHOME = 'Townhome',
}

export class CreatePropertyDto {
    @IsString()
    title: string;

    @IsString()
    description: string;

    @IsNumber()
    @Min(0)
    price: number;

    @IsString()
    currency: string;

    @IsEnum(ListingType)
    listingType: ListingType;

    @IsEnum(PropertyType)
    propertyType: PropertyType;

    @IsString()
    address: string;

    @IsString()
    city: string;

    @IsNumber()
    @Min(0)
    rooms: number; // or bedrooms

    @IsNumber()
    @Min(0)
    bathrooms: number;

    @IsNumber()
    @Min(0)
    areaSquareMeters: number;

    @IsNumber()
    @Min(1800)
    yearBuilt: number;

    @IsArray()
    @IsString({ each: true })
    amenities: string[];

    @IsOptional()
    @IsArray()
    @IsUrl({}, { each: true })
    imageUrls?: string[];
}
