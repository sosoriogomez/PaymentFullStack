import { aProduct } from '../../../../test/builders/product.builder';
import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { err, ok } from '../../../shared/kernel/result';
import { GetProductStock } from './get-product-stock.use-case';
import { GetProduct } from './get-product.use-case';
import { ListProducts } from './list-products.use-case';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('products use cases', () => {
  const headphones = aProduct().withSku('AUD-001').build();
  const keyboard = aProduct()
    .withId('6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e02')
    .withSku('KBD-002')
    .withStock(0)
    .build();
  const repository = new InMemoryProductRepository([keyboard, headphones]);

  describe('ListProducts', () => {
    it('should list the catalog up to the limit', async () => {
      const useCase = new ListProducts(repository);

      expect(await useCase.execute({ limit: 10 })).toEqual(ok([headphones, keyboard]));
      expect(await useCase.execute({ limit: 1 })).toEqual(ok([headphones]));
    });
  });

  describe('GetProduct', () => {
    it('should return the product', async () => {
      expect(await new GetProduct(repository).execute(headphones.id)).toEqual(ok(headphones));
    });

    it('should report a product that does not exist', async () => {
      expect(await new GetProduct(repository).execute(MISSING_ID)).toEqual(
        err({ code: 'PRODUCT_NOT_FOUND', productId: MISSING_ID }),
      );
    });
  });

  describe('GetProductStock', () => {
    const useCase = new GetProductStock(new GetProduct(repository));

    it('should return the available units and when they changed', async () => {
      expect(await useCase.execute(keyboard.id)).toEqual(
        ok({ productId: keyboard.id, available: 0, updatedAt: keyboard.updatedAt }),
      );
    });

    it('should report a product that does not exist', async () => {
      expect(await useCase.execute(MISSING_ID)).toEqual(
        err({ code: 'PRODUCT_NOT_FOUND', productId: MISSING_ID }),
      );
    });
  });
});
