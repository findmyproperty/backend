import { BadRequestException } from '@nestjs/common';
import { assertPostingContract } from './property-posting';

const commercialDescription =
  'A furnished office on the main road with lift access, reserved parking, and a private washroom for the team.';

function plotDetails() {
  return {
    plotArea: 2400,
    boundaryWall: true,
    availableFrom: '2026-11-01',
  };
}

function commercialBase() {
  return {
    commercialPropertyType: 'office_space',
    buildingType: 'business_park',
    ageOfProperty: 'one_to_five_years',
    floor: 2,
    totalFloors: 8,
    superBuiltUpArea: 1800,
    furnishing: 'fully_furnished',
    contactPreference: 'phone',
  };
}

describe('assertPostingContract', () => {
  it('accepts a current payload that omits the new fields', () => {
    expect(() => assertPostingContract({})).not.toThrow();
  });

  it('rejects a sector without a posting type', () => {
    expect(() =>
      assertPostingContract({ propertySector: 'plot', details: null }),
    ).toThrow(BadRequestException);
  });

  it('rejects plot with rent', () => {
    expect(() =>
      assertPostingContract({
        propertySector: 'plot',
        postingType: 'rent',
        details: plotDetails(),
      }),
    ).toThrow(/not an allowed pair/);
  });

  it('accepts plot resale and does not require bedrooms', () => {
    expect(() =>
      assertPostingContract({
        propertySector: 'plot',
        postingType: 'resale',
        details: plotDetails(),
        price: 400000,
      }),
    ).not.toThrow();
  });

  it('rejects plot resale without plot area', () => {
    expect(() =>
      assertPostingContract({
        propertySector: 'plot',
        postingType: 'resale',
        details: { boundaryWall: true, availableFrom: '2026-11-01' },
      }),
    ).toThrow(/plotArea/);
  });

  it('accepts commercial rent and rejects it without a deposit', () => {
    const input = {
      propertySector: 'commercial',
      postingType: 'rent',
      details: { ...commercialBase(), securityDeposit: 50000, availableFrom: '2026-12-01' },
      description: commercialDescription,
      price: 80000,
      latitude: 13.08,
      longitude: 80.27,
    };
    expect(() => assertPostingContract(input)).not.toThrow();
    expect(() =>
      assertPostingContract({
        ...input,
        details: { ...commercialBase(), availableFrom: '2026-12-01' },
      }),
    ).toThrow(/securityDeposit/);
  });

  it('accepts commercial sale and rejects an unknown posting type', () => {
    expect(() =>
      assertPostingContract({
        propertySector: 'commercial',
        postingType: 'sale',
        details: {
          ...commercialBase(),
          ownershipType: 'freehold',
          possessionDate: '2026-12-01',
        },
        description: commercialDescription,
        price: 9000000,
        latitude: 13.08,
        longitude: 80.27,
      }),
    ).not.toThrow();
    expect(() =>
      assertPostingContract({
        propertySector: 'commercial',
        postingType: 'pg',
        details: commercialBase(),
      }),
    ).toThrow(/not an allowed pair/);
  });

  it('accepts residential rent and rejects a missing BHK', () => {
    const details = {
      apartmentType: 'apartment',
      apartmentName: 'Palm Court',
      bhkType: '2',
      floor: '3',
      totalFloors: '12',
      builtUpArea: 1100,
      propertyAge: '1_to_3',
      availability: 'rent',
      deposit: 40000,
      availableFrom: '2026-11-02',
      furnishing: 'semi-furnished',
      parking: 'car',
      preferredTenants: 'family',
      bathroomCount: 2,
      petAllowed: false,
      gym: true,
      nonVegAllowed: true,
      gatedSecurity: true,
    };
    expect(() =>
      assertPostingContract({
        propertySector: 'residential',
        postingType: 'rent',
        details,
        price: 20000,
      }),
    ).not.toThrow();
    const { bhkType: _bhk, ...withoutBhk } = details;
    expect(() =>
      assertPostingContract({
        propertySector: 'residential',
        postingType: 'rent',
        details: withoutBhk,
        price: 20000,
      }),
    ).toThrow(/bhkType/);
  });

  it('accepts PG without bedrooms when each selected room has rent and deposit', () => {
    expect(() =>
      assertPostingContract({
        propertySector: 'residential',
        postingType: 'pg',
        details: {
          roomTypes: ['single'],
          rooms: { single: { rent: 8000, deposit: 8000, amenities: ['AC'] } },
          availableFor: 'male',
          preferredGuests: 'working',
          availableFrom: '2026-11-01',
          foodIncluded: true,
        },
        price: 8000,
      }),
    ).not.toThrow();
  });

  it('rejects details when the posting pair is omitted', () => {
    expect(() => assertPostingContract({ details: { plotArea: 10 } })).toThrow(
      /details requires/,
    );
  });
});
