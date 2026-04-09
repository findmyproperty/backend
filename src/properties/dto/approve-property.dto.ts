import { IsInt, IsOptional, Min } from 'class-validator';

export class ApprovePropertyDto {
  /** Listing agent who will receive leads for this property (must be role `agent`). */
  @IsOptional()
  @IsInt()
  @Min(1)
  assignedAgentId?: number;
  @IsOptional()
  skipAgentAssignment?: boolean;
}
