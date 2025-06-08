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
    priceId: 'price_1RXNtTRpbZohf2L5guw1FjOX',
    name: 'Creator',
    description: '30 credits of AI logo and video generation token.',
    mode: 'subscription',
    price: 29.99,
    currency: 'MYR'
  }
];

export const getProductByPriceId = (priceId: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.priceId === priceId);
};

export const getProductById = (id: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.id === id);
};