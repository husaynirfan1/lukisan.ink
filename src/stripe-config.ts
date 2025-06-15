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
    id: 'prod_SSwR3x2OKd1ISe',
    priceId: 'price_1RY1ClRpbZohf2L5sr9q1E4P',
    name: 'Creator',
    description: '30 credits of content generation, no expiry and watermark.',
    mode: 'subscription',
    price: 29.99,
    currency: 'MYR'
  },
  {
    id: 'prod_SUz7y9asE6cLYf',
    priceId: 'price_1RZz8zRpjJ1Aj1byvX5NLc7u',
    name: 'Creator',
    description: '10 extra credits.',
    mode: 'payment',
    price: 2.99,
    currency: 'MYR'
  }
];

export const getProductByPriceId = (priceId: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.priceId === priceId);
};

export const getProductById = (id: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.id === id);
};