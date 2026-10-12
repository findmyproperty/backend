import { BadRequestException } from '@nestjs/common';

export const PROPERTY_SECTORS = ['residential', 'commercial', 'plot'] as const;
export const POSTING_TYPES = [
  'rent',
  'resale',
  'sale',
  'pg',
  'flatmates',
] as const;

export type PropertySector = (typeof PROPERTY_SECTORS)[number];
export type PostingType = (typeof POSTING_TYPES)[number];

const PAIRS: Record<PropertySector, readonly PostingType[]> = {
  residential: ['rent', 'resale', 'pg', 'flatmates'],
  commercial: ['rent', 'sale'],
  plot: ['resale'],
};

const COMMERCIAL_PROPERTY_TYPES = new Set([
  'office_space',
  'co_working',
  'shop',
  'showroom',
  'godown_warehouse',
  'industrial_shed',
  'industrial_building',
  'other_business',
  'restaurant_cafe',
]);

export type PostingContractInput = {
  propertySector?: string | null;
  postingType?: string | null;
  details?: unknown;
  description?: string | null;
  price?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function isPropertySector(value: unknown): value is PropertySector {
  return (
    typeof value === 'string' &&
    (PROPERTY_SECTORS as readonly string[]).includes(value)
  );
}

export function isPostingType(value: unknown): value is PostingType {
  return (
    typeof value === 'string' &&
    (POSTING_TYPES as readonly string[]).includes(value)
  );
}

export function isAllowedPair(sector: PropertySector, posting: PostingType) {
  return PAIRS[sector].includes(posting);
}

type Details = Record<string, unknown>;

function asDetails(value: unknown): Details | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Details;
}

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function numberOf(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function positive(value: unknown) {
  return numberOf(value) > 0;
}

function nonNegative(value: unknown) {
  const n = numberOf(value);
  return Number.isFinite(n) && n >= 0;
}

function yesNo(value: unknown) {
  return (
    value === true ||
    value === false ||
    value === 'yes' ||
    value === 'no'
  );
}

function isYes(value: unknown) {
  return value === true || value === 'yes';
}

function isNo(value: unknown) {
  return value === false || value === 'no';
}

function validDate(value: unknown) {
  const raw = text(value);
  if (!raw) return false;
  return !Number.isNaN(Date.parse(raw));
}

export function assertPostingContract(input: PostingContractInput) {
  const sector = text(input.propertySector);
  const posting = text(input.postingType);
  const hasSector = sector.length > 0;
  const hasPosting = posting.length > 0;

  if (hasSector !== hasPosting) {
    throw new BadRequestException(
      'propertySector and postingType must be sent together',
    );
  }

  if (!hasSector) {
    if (input.details != null) {
      throw new BadRequestException(
        'details requires propertySector and postingType',
      );
    }
    return;
  }

  if (
    !isPropertySector(sector) ||
    !isPostingType(posting) ||
    !isAllowedPair(sector, posting)
  ) {
    throw new BadRequestException(
      'propertySector and postingType are not an allowed pair',
    );
  }

  const details = asDetails(input.details);
  if (!details) {
    throw new BadRequestException('details must be an object');
  }

  const errors = listingDetailsErrors(sector, posting, details, input);
  if (errors.length > 0) {
    throw new BadRequestException(errors.join('; '));
  }
}

export function listingDetailsErrors(
  sector: PropertySector,
  posting: PostingType,
  details: Details,
  input: PostingContractInput,
): string[] {
  const errors: string[] = [];
  const miss = (path: string, message: string) => errors.push(`${path}: ${message}`);

  if (sector === 'plot' && posting === 'resale') {
    if (!positive(details.plotArea)) miss('details.plotArea', 'Plot area is required');
    if (!yesNo(details.boundaryWall)) {
      miss('details.boundaryWall', 'Boundary wall is required');
    }
    if (!validDate(details.availableFrom)) {
      miss('details.availableFrom', 'Available from is required');
    }
    return errors;
  }

  if (sector === 'commercial') {
    validateCommercial(posting, details, input, miss);
    return errors;
  }

  if (posting === 'pg') {
    validatePg(details, miss);
    return errors;
  }

  if (posting === 'flatmates') {
    validateFlatmates(details, input, miss);
    return errors;
  }

  if (posting === 'resale') {
    validateResale(details, input, miss);
    return errors;
  }

  validateResidentialRent(details, input, miss);
  return errors;
}

function validateCommercial(
  posting: PostingType,
  details: Details,
  input: PostingContractInput,
  miss: (path: string, message: string) => void,
) {
  const propertyType = text(details.commercialPropertyType);
  if (!COMMERCIAL_PROPERTY_TYPES.has(propertyType)) {
    miss('details.commercialPropertyType', 'Property type is required');
  }
  if (!text(details.buildingType)) miss('details.buildingType', 'Building type is required');
  if (!text(details.ageOfProperty)) miss('details.ageOfProperty', 'Property age is required');
  if (!nonNegative(details.floor)) miss('details.floor', 'Floor is required');
  if (!nonNegative(details.totalFloors)) miss('details.totalFloors', 'Total floors is required');
  if (nonNegative(details.floor) && nonNegative(details.totalFloors)) {
    if (numberOf(details.totalFloors) < numberOf(details.floor)) {
      miss('details.totalFloors', 'Total floors must be at least the selected floor');
    }
  }
  if (!positive(details.superBuiltUpArea)) {
    miss('details.superBuiltUpArea', 'Built up area is required');
  }
  if (!text(details.furnishing)) miss('details.furnishing', 'Furnishing is required');
  if (!text(details.contactPreference)) {
    miss('details.contactPreference', 'Contact preference is required');
  }
  const description = text(input.description);
  if (description.length < 50 || description.length > 3000) {
    miss('description', 'Description must be between 50 and 3000 characters');
  }
  if (input.latitude == null || input.longitude == null) {
    miss('latitude', 'Confirm the property on the map');
  }
  if (posting === 'rent') {
    if (!positive(input.price)) miss('price', 'Expected rent is required');
    if (!nonNegative(details.securityDeposit)) {
      miss('details.securityDeposit', 'Security deposit is required');
    }
    if (!validDate(details.availableFrom)) {
      miss('details.availableFrom', 'Available from is required');
    }
    if (
      text(details.lockInPeriod) &&
      text(details.leaseDuration) &&
      numberOf(details.lockInPeriod) > numberOf(details.leaseDuration)
    ) {
      miss('details.lockInPeriod', 'Lock-in period cannot exceed lease duration');
    }
  } else {
    if (!positive(input.price)) miss('price', 'Expected sale price is required');
    if (!text(details.ownershipType)) miss('details.ownershipType', 'Ownership type is required');
    if (!validDate(details.possessionDate)) {
      miss('details.possessionDate', 'Possession date is required');
    }
  }
  const frequency = text(details.maintenanceFrequency);
  if (frequency && frequency !== 'included' && !nonNegative(details.maintenanceAmount)) {
    miss('details.maintenanceAmount', 'Maintenance amount is required');
  }
  if (isYes(details.parkingAvailable) && !nonNegative(details.parkingCount)) {
    miss('details.parkingCount', 'Parking slots are required');
  }
}

function apartmentShape(details: Details, miss: (path: string, message: string) => void, resale: boolean) {
  const kind = text(details.apartmentType);
  const allowed = resale
    ? ['apartment', 'independent_house', 'gated_villa', 'standalone_building']
    : ['apartment', 'independent_house', 'gated_villa'];
  if (!allowed.includes(kind)) miss('details.apartmentType', 'Apartment type is required');
  const hideFloor = kind === 'independent_house' || kind === 'gated_villa';
  const showName = kind === 'apartment' || kind === 'gated_villa';
  const showNumberOfFloors = kind === 'independent_house' || kind === 'gated_villa';
  if (!hideFloor && kind) {
    if (!text(details.floor)) miss('details.floor', 'Floor is required');
    if (!text(details.totalFloors)) miss('details.totalFloors', 'Total floors is required');
  }
  if (showName && !text(details.apartmentName)) {
    miss('details.apartmentName', 'Apartment name is required');
  }
  if (showNumberOfFloors && !text(details.numberOfFloors)) {
    miss('details.numberOfFloors', 'Number of floors is required');
  }
  if (!text(details.bhkType)) miss('details.bhkType', 'BHK type is required');
  if (!positive(details.builtUpArea)) miss('details.builtUpArea', 'Built-up area is required');
}

function validateResidentialRent(
  details: Details,
  input: PostingContractInput,
  miss: (path: string, message: string) => void,
) {
  apartmentShape(details, miss, false);
  if (!text(details.propertyAge)) miss('details.propertyAge', 'Property age is required');
  const availability = text(details.availability);
  if (availability !== 'rent' && availability !== 'lease') {
    miss('details.availability', 'Choose rent or lease');
  }
  if (availability === 'lease') {
    if (!positive(details.leaseAmount)) miss('details.leaseAmount', 'Expected lease amount is required');
  } else if (availability === 'rent') {
    if (!positive(input.price)) miss('price', 'Expected rent is required');
    if (!nonNegative(details.deposit)) miss('details.deposit', 'Expected deposit is required');
  }
  if (text(details.maintenanceMode) === 'extra' && !positive(details.maintenanceAmount)) {
    miss('details.maintenanceAmount', 'Maintenance amount is required');
  }
  if (!validDate(details.availableFrom)) miss('details.availableFrom', 'Available from is required');
  if (!text(details.furnishing)) miss('details.furnishing', 'Furnishing is required');
  if (!text(details.parking)) miss('details.parking', 'Parking is required');
  if (!text(details.preferredTenants)) miss('details.preferredTenants', 'Preferred tenants is required');
  if (!positive(details.bathroomCount)) miss('details.bathroomCount', 'Bathrooms are required');
  if (!yesNo(details.petAllowed)) miss('details.petAllowed', 'Pet allowed is required');
  if (!yesNo(details.gym)) miss('details.gym', 'Gym is required');
  if (!yesNo(details.nonVegAllowed)) miss('details.nonVegAllowed', 'Non-veg allowed is required');
  if (!yesNo(details.gatedSecurity)) miss('details.gatedSecurity', 'Gated security is required');
}

function validateResale(
  details: Details,
  input: PostingContractInput,
  miss: (path: string, message: string) => void,
) {
  apartmentShape(details, miss, true);
  if (!text(details.propertyAge)) miss('details.propertyAge', 'Property age is required');
  if (!text(details.facing)) miss('details.facing', 'Facing is required');
  if (!positive(input.price)) miss('price', 'Expected price is required');
  if (!nonNegative(details.maintenanceCost)) {
    miss('details.maintenanceCost', 'Maintenance cost is required');
  }
  if (!validDate(details.availableFrom)) miss('details.availableFrom', 'Available from is required');
  if (!text(details.furnishing)) miss('details.furnishing', 'Furnishing is required');
  if (!text(details.parking)) miss('details.parking', 'Parking is required');
  if (!positive(details.bathroomCount)) miss('details.bathroomCount', 'Bathrooms are required');
  if (!yesNo(details.gym)) miss('details.gym', 'Gym is required');
  if (!yesNo(details.gatedSecurity)) miss('details.gatedSecurity', 'Gated security is required');
  if (!text(details.whoWillShow)) miss('details.whoWillShow', 'Who will show the property is required');
  if (!text(details.allotmentLetter)) miss('details.allotmentLetter', 'Allotment letter is required');
  if (!text(details.saleDeed)) miss('details.saleDeed', 'Sale deed certificate is required');
  if (isNo(details.saleDeed) && !text(details.saleAgreement)) {
    miss('details.saleAgreement', 'Sale agreement is required');
  }
  if (!text(details.propertyTax)) miss('details.propertyTax', 'Property tax is required');
  if (!text(details.occupancyCertificate)) {
    miss('details.occupancyCertificate', 'Occupancy certificate is required');
  }
}

function validatePg(details: Details, miss: (path: string, message: string) => void) {
  const roomTypes = Array.isArray(details.roomTypes) ? details.roomTypes.map(String) : [];
  if (roomTypes.length === 0) miss('details.roomTypes', 'Select at least one room type');
  const rooms =
    details.rooms && typeof details.rooms === 'object' && !Array.isArray(details.rooms)
      ? (details.rooms as Record<string, Details>)
      : {};
  for (const roomType of roomTypes) {
    const room = rooms[roomType] ?? {};
    if (!positive(room.rent)) miss(`details.rooms.${roomType}.rent`, 'Expected rent per person is required');
    if (!nonNegative(room.deposit)) {
      miss(`details.rooms.${roomType}.deposit`, 'Expected deposit per person is required');
    }
  }
  if (!text(details.availableFor)) miss('details.availableFor', 'Place availability is required');
  if (!text(details.preferredGuests)) miss('details.preferredGuests', 'Preferred guests is required');
  if (!validDate(details.availableFrom)) miss('details.availableFrom', 'Available from is required');
  if (!yesNo(details.foodIncluded)) miss('details.foodIncluded', 'Food included is required');
}

function validateFlatmates(
  details: Details,
  input: PostingContractInput,
  miss: (path: string, message: string) => void,
) {
  apartmentShape(details, miss, false);
  if (!text(details.roomType)) miss('details.roomType', 'Room type is required');
  if (!text(details.tenantType)) miss('details.tenantType', 'Tenant type is required');
  if (!text(details.propertyAge)) miss('details.propertyAge', 'Property age is required');
  if (!positive(input.price)) miss('price', 'Expected rent is required');
  if (!nonNegative(details.deposit)) miss('details.deposit', 'Expected deposit is required');
  if (text(details.maintenanceMode) === 'extra' && !positive(details.maintenanceAmount)) {
    miss('details.maintenanceAmount', 'Maintenance amount is required');
  }
  if (!validDate(details.availableFrom)) miss('details.availableFrom', 'Available from is required');
  if (!text(details.furnishing)) miss('details.furnishing', 'Furnishing is required');
  if (!text(details.parking)) miss('details.parking', 'Parking is required');
  if (!yesNo(details.attachedBathroom)) miss('details.attachedBathroom', 'Attached bathroom is required');
  if (!yesNo(details.acRoom)) miss('details.acRoom', 'AC room is required');
  if (!yesNo(details.nonVegAllowed)) miss('details.nonVegAllowed', 'Non-veg allowed is required');
  if (!yesNo(details.gym)) miss('details.gym', 'Gym is required');
  if (!yesNo(details.gatedSecurity)) miss('details.gatedSecurity', 'Gated security is required');
  if (!text(details.whoWillShow)) miss('details.whoWillShow', 'Who will show the property is required');
}
