import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min, IsOptional, Max } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Trang số' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 10,
    description: 'Số lượng bản ghi mỗi trang',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 10;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  get take(): number {
    return this.limit;
  }
}
