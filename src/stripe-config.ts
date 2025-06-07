export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description: string;
  mode: 'payment' | 'subscription';
  price: number;
  currency: string;
}

export const stripeProducts: StripeProduct[] = [
  {
    id: 'prod_SS8qfUAqwAY4PO',
    priceId: 'price_1RXGXoRpbZohf2L5Alr7U8Ag',
    name: 'Lukisan Pro',
    description: '100 credits of AI logo generation token.',
    mode: 'subscription',
    price: 4.99,
    currency: 'MYR'
  }
];

export const getProductByPriceId = (priceId: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.priceId === priceId);
};

export const getProductById = (id: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.id === id);
};