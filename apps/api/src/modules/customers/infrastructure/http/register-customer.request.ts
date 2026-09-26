import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterCustomerRequest {
  @Transform(trim)
  @IsString()
  @Length(3, 80)
  @Matches(/^\p{L}[\p{L} .'-]*$/u, { message: 'fullName must only contain letters and spaces' })
  readonly fullName!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  readonly email!: string;

  @Transform(trim)
  @Matches(/^3\d{9}$/, {
    message: 'phone must be a Colombian mobile number (10 digits starting with 3)',
  })
  readonly phone!: string;
}
