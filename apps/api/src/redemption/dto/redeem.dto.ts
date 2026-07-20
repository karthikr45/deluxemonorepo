import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class RedeemDto {
  @ApiProperty({
    description: 'Shopify customer id (gid form)',
    example: 'gid://shopify/Customer/1234567890',
  })
  @IsString()
  @MinLength(1)
  shopifyCustomerId!: string;

  @ApiProperty({
    description: 'Points to redeem — a positive multiple of 100 (100 points = R3)',
    example: 300,
  })
  @IsInt()
  @IsPositive()
  points!: number;
}
