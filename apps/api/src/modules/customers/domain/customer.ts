import { type ColombianPhone, type Email, type PersonName } from './contact';

export interface CustomerProps {
  readonly id: string;
  readonly fullName: PersonName;
  readonly email: Email;
  readonly phone: ColombianPhone;
}

/** Guest customer identified by email (M-12: the latest name and phone win). */
export class Customer {
  private constructor(private readonly props: CustomerProps) {}

  static create(props: CustomerProps): Customer {
    return new Customer(props);
  }

  get id(): string {
    return this.props.id;
  }

  get fullName(): string {
    return this.props.fullName.value;
  }

  get email(): string {
    return this.props.email.value;
  }

  get phone(): string {
    return this.props.phone.value;
  }
}
