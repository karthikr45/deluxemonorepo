import { IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class RedeemDto {
  @IsString()
  @MinLength(1)
  shopifyCustomerId!: string;

  @IsInt()
  @IsPositive()
  points!: number;
}
