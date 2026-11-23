import { GoneException } from '@nestjs/common';
import { CheckoutService } from '../orders/checkout.service';
import { OrdersController } from '../orders/orders.controller';
import { OrdersService } from '../orders/orders.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('Deprecated payment/order entry points', () => {
  it('disables standalone order creation', () => {
    const controller = new OrdersController(
      {} as OrdersService,
      {} as CheckoutService,
    );
    expect(() => controller.create()).toThrow(GoneException);
  });

  it('disables client-controlled VNPay URL creation', () => {
    const controller = new PaymentsController({} as PaymentsService);
    expect(() => controller.createVnpayUrl()).toThrow(GoneException);
  });
});
