import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Query shape: `?pickup=lat,lng&drops=lat,lng|lat,lng|...`
 *
 * Kept as a plain string + regex because Nest's query binding doesn't easily
 * express "array of coord tuples" via decorators; parsing happens in the
 * controller and validation errors there produce BadRequest.
 */
export class TripEstimateQueryDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, {
    message: 'pickup must be "lat,lng"',
  })
  pickup: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  /** Pipe-separated list of up to 5 coord tuples, e.g. "12.9,77.5|12.8,77.6" */
  drops: string;
}
