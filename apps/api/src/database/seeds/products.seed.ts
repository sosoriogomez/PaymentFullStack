export interface ProductSeed {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly priceInCents: number;
  readonly stock: number;
  readonly imageKey: string;
}

/** Dummy catalog (prices in COP cents). One product is sold out on purpose to show that state. */
export const PRODUCT_SEEDS: readonly ProductSeed[] = [
  {
    id: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e01',
    sku: 'AUD-001',
    name: 'Audífonos inalámbricos Pulse',
    description:
      'Audífonos over-ear con cancelación activa de ruido, 30 horas de batería, carga rápida USB-C y micrófono para llamadas.',
    priceInCents: 189_900_00,
    stock: 12,
    imageKey: 'wireless-headphones',
  },
  {
    id: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e02',
    sku: 'KBD-002',
    name: 'Teclado mecánico Nova 75\u00a0%',
    description:
      'Teclado compacto con switches lineales intercambiables en caliente, retroiluminación RGB y conexión Bluetooth o cable.',
    priceInCents: 329_900_00,
    stock: 5,
    imageKey: 'mechanical-keyboard',
  },
  {
    id: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e03',
    sku: 'WCH-003',
    name: 'Reloj inteligente Orbit',
    description:
      'Pantalla AMOLED de 1,4", GPS, monitoreo de ritmo cardiaco y sueño, resistente al agua 5 ATM y 10 días de batería.',
    priceInCents: 459_900_00,
    stock: 3,
    imageKey: 'smartwatch',
  },
  {
    id: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e04',
    sku: 'SPK-004',
    name: 'Parlante portátil Wave',
    description:
      'Sonido 360° de 20 W, resistente a salpicaduras IPX7, 15 horas de reproducción y emparejamiento estéreo.',
    priceInCents: 149_900_00,
    stock: 20,
    imageKey: 'portable-speaker',
  },
  {
    id: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e05',
    sku: 'HUB-005',
    name: 'Hub USB-C 7 en 1',
    description:
      'HDMI 4K, lector de tarjetas SD y microSD, dos puertos USB-A 3.0 y carga Power Delivery de 100 W.',
    priceInCents: 99_900_00,
    stock: 0,
    imageKey: 'usb-c-hub',
  },
];

interface SqlRunner {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

/**
 * Idempotent upsert by SKU. Re-running it refreshes catalog data but never overwrites the stock,
 * because live purchases have already changed it.
 */
export async function seedProducts(
  runner: SqlRunner,
  seeds: readonly ProductSeed[] = PRODUCT_SEEDS,
): Promise<number> {
  for (const product of seeds) {
    await runner.query(
      `INSERT INTO products (id, sku, name, description, price_in_cents, currency, stock, image_key)
       VALUES ($1, $2, $3, $4, $5, 'COP', $6, $7)
       ON CONFLICT (sku) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         price_in_cents = EXCLUDED.price_in_cents,
         image_key = EXCLUDED.image_key,
         updated_at = now()`,
      [
        product.id,
        product.sku,
        product.name,
        product.description,
        product.priceInCents,
        product.stock,
        product.imageKey,
      ],
    );
  }
  return seeds.length;
}
