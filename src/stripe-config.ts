// Define the structure for price information for a single currency
export interface PriceInfo {
  priceId: string;
  price: number;
  currency: string;
}

// Define the main structure for a Stripe product, now with multiple prices
export interface StripeProduct {
  id: string;
  name: string;
  description: string;
  mode: 'payment' | 'subscription';
  prices: {
    [locale: string]: PriceInfo; // e.g., prices['us'] or prices['my']
  };
}

/**
 * Main product list with nested, multi-currency price information.
 * The keys 'my' and 'us' correspond to the locales.
 */
export const stripeProducts: StripeProduct[] = [
  {
    id: 'prod_SSwR3x2OKd1ISe', // Creator Plan Product ID
    name: 'Creator',
    description: '30 credits of content generation, no expiry and watermark.',
    mode: 'subscription',
    prices: {
      // Malaysian Pricing
      my: {
        priceId: 'price_1RY1ClRpbZohf2L5sr9q1E4P',
        price: 29.99,
        currency: 'MYR'
      },
      // United States Pricing
      us: {
        priceId: 'price_1RY1ClRpbZohf2L5sr9q1E4P', // IMPORTANT: Replace with your actual USD Price ID from Stripe
        price: 9.99, // Example price in USD
        currency: 'USD'
      }
    }
  },
  {
    id: 'prod_SUxt63tLx3WTzh', // "Add Credits" Product ID
    name: '10 Additional Credits',
    description: '10 additional credits.',
    mode: 'payment',
    prices: {
      // Malaysian Pricing
      my: {
        priceId: 'price_1RZxy5RpbZohf2L5s3WCttH0',
        price: 2.90,
        currency: 'MYR'
      },
      // United States Pricing
      us: {
        priceId: 'price_1RZxy5RpbZohf2L5s3WCttH0', // IMPORTANT: Replace with your actual USD Price ID from Stripe
        price: 1.90, // Example price in USD
        currency: 'USD'
      }
    }
  }
];

/**
 * Gets the user's locale based on their browser settings.
 * Defaults to 'my' (Malaysia) if not 'us' (United States).
 * This function is safe to run on the server (SSR) as it checks for `window`.
 * @returns 'us' | 'my'
 */
export const getUserLocale = (): 'us' | 'my' => {
  if (typeof window !== 'undefined' && window.navigator) {
    // navigator.language typically returns a string like "en-US", "en-GB", etc.
    const userLocale = window.navigator.language.toLowerCase();
    if (userLocale.includes('us')) {
      return 'us';
    }
  }
  // Default to Malaysia for all other locales or in a server environment
  return 'my';
};

/**
 * Finds a product by its ID and returns its details along with the correct
 * price information for the user's specified locale.
 * @param productId The ID of the Stripe Product (e.g., 'prod_SSwR3x2OKd1ISe').
 * @param locale The user's locale ('us' or 'my').
 * @returns A single, combined object with all product and localized price info, or undefined if the product is not found.
 */
export const getProductDetailsForLocale = (
    productId: string, 
    locale: 'us' | 'my'
): (StripeProduct & PriceInfo) | undefined => {
  
  const product = stripeProducts.find(p => p.id === productId);
  if (!product) {
    console.error(`Product with ID "${productId}" not found.`);
    return undefined;
  }

  // Find the correct price for the given locale.
  // If the locale's price doesn't exist, it gracefully falls back to the default 'my' price.
  const priceInfo = product.prices[locale] || product.prices.my;
  
  if (!priceInfo) {
      console.error(`Price information for locale "${locale}" and default 'my' not found for product "${productId}".`);
      return undefined;
  }

  // Return a single object with all details combined for easy use
  return {
    ...product,
    ...priceInfo,
  };
};
