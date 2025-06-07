const FIREWORKS_API_KEY = import.meta.env.VITE_FIREWORKS_API_KEY;

if (!FIREWORKS_API_KEY) {
  throw new Error('Missing Fireworks AI API key');
}

export interface LogoGenerationRequest {
  prompt: string;
  category: string;
  style?: string;
  size?: string;
  aspectRatio?: string;
  guidanceScale?: number;
  numInferenceSteps?: number;
  seed?: number;
}

export interface PromptRefinementRequest {
  originalPrompt: string;
  category: string;
}

// Style-specific prompt templates - FULLY UPGRADED
const stylePrompts = {
  professional: {
    prefix: "You are an expert logo designer specializing in sophisticated and timeless brand identities. Your task is to generate a 'Professional' theme logo for:",
    styleElements: "Core Principles: Clarity, Timelessness, Trust, and Authority. Design Elements: Utilize classic and elegant serif or clean sans-serif fonts as a primary element. Employ a sophisticated and conservative color palette (deep blues, rich burgundies, metallic golds, refined grays). Imagery, if used, should be a clean, abstract symbol or a powerful monogram.",
    suffix: "The logo must exude confidence and reliability. Its composition should be balanced and harmonious with ample negative space. Generate a high-resolution, vector-style logo with clean lines, ensuring it is versatile and effective in both color and monochrome for all corporate applications."
  },
  tech: {
    prefix: "You are a cutting-edge logo designer focused on the 'Tech & Digital' landscape. Your mission is to translate the user's prompt into a logo that is innovative, dynamic, and captures the essence of the digital age for:",
    styleElements: "Core Principles: Modernity, Innovation, Connectivity, and Scalability. Design Elements: Employ modern, clean sans-serif fonts, often with custom letterforms or varied weights. Utilize a vibrant color palette with gradients or neon accents (electric blues, purples, energetic greens). Imagery should be abstract: network nodes, data pathways, circuit patterns, or sleek geometric shapes.",
    suffix: "The final logo must be a crisp, vector-style design that feels energetic and progressive. It should be scalable, legible as a small app icon, and impactful on large displays. The output must be a high-resolution image suitable for all digital and print applications."
  },
  minimalist: {
    prefix: "You are a master of minimalist design. Your philosophy is 'less is more.' Create a 'Minimalist' theme logo that is clean, intentional, and memorable for:",
    styleElements: "Core Principles: Simplicity, Elegance, and Impactful Use of Negative Space. Design Elements: Select a single, clean, and well-balanced font. Adhere to a strictly monochromatic or a severely limited color palette (often just one accent color). Use simple geometric shapes, a single continuous line, or a highly abstracted symbol. Every element must have a clear purpose.",
    suffix: "The design must be stripped to its essential elements. The final logo should be a precise, vector-style image that is memorable through its subtlety and cleverness. It must be perfectly scalable and legible at any size."
  },
  sports: {
    prefix: "You are an expert sports branding designer. Create a dynamic, high-impact 'Sports' theme logo for:",
    styleElements: "Core Principles: Strength, Speed, Competition, and Team Spirit. Design Elements: Use bold, aggressive typography (slab serifs, italics, or custom scripts with sharp angles). Employ a high-contrast, energetic color palette (fiery reds, electric blues, victory gold). Imagery should be iconic and motion-focused, using stylized mascots, shields, or dynamic swooshes that convey action.",
    suffix: "The logo must be iconic, aggressive, and full of energy. It needs to be instantly recognizable and suitable for team uniforms, merchandise, and digital media. Generate a powerful, vector-style design that works well even in monochrome."
  },
  abstract: {
    prefix: "You are a conceptual artist and brand identity designer. Create a unique and artistic 'Abstract' theme logo for:",
    styleElements: "Core Principles: Intrigue, Uniqueness, Modernity, and Interpretation. Design Elements: Typography can be either a clean, grounding sans-serif to contrast the art, or an experimental, deconstructed typeface that is part of the art itself. Use a deliberate color palette—either minimalist or a vibrant, artistic explosion. Imagery should be non-representational: generative patterns, flowing lines, or geometric compositions that create a visual metaphor.",
    suffix: "The logo must be visually striking and thought-provoking, sparking curiosity. Despite its abstract nature, it must be well-balanced and memorable. Generate a creative, high-resolution design that stands out from the ordinary."
  },
  nature: {
    prefix: "You are a brand designer specializing in eco-conscious and natural brands. Design an organic, 'Nature-inspired' logo for:",
    styleElements: "Core Principles: Authenticity, Sustainability, Growth, and Tranquility. Design Elements: Use approachable typography (rustic serifs, clean sans-serifs, or elegant scripts). The color palette must be earth-toned (forest greens, soil browns, sky blues, stone grays). Imagery should be stylized, line-art representations of leaves, trees, water, or mountains.",
    suffix: "The logo should feel warm, trustworthy, and approachable, conveying a deep connection to the earth. The design must be suitable for natural or recycled packaging materials. Generate an authentic, vector-style logo with a clean and organic feel."
  },
  food: {
    prefix: "You are a food branding specialist who understands the psychology of appetite. Create an appetizing 'Food & Beverage' logo for:",
    styleElements: "Core Principles: Deliciousness, Freshness, Quality, and Trust. Design Elements: Typography should match the food's character (friendly and rounded for cafes, elegant serifs for fine dining). Use a color palette that stimulates the appetite (warm reds, fresh greens, rich browns, golden yellows). Imagery should be clean, stylized icons of food, utensils, or shapes that evoke steam or sizzle.",
    suffix: "The logo must look delicious, clean, and inviting. It should make the viewer feel hungry or thirsty and convey quality and freshness. Generate a welcoming, vector-style design that looks great on menus, packaging, and signage."
  },
  {
  real_estate: {
    prefix: "You are an architect and brand strategist. Design a solid and trustworthy 'Real Estate & Architecture' theme logo for:",
    styleElements: "Core Principles: Trust, Stability, Professionalism, and Elegance. Design Elements: Typography should be strong and clear, using either a classic serif for a sense of establishment or a clean sans-serif for modernity. The color palette should be grounded and sophisticated—think deep blues, charcoal grays, earthy tones, with metallic accents like gold or silver. Imagery should incorporate architectural elements: abstract rooflines, geometric shapes representing floor plans, stylized pillars, or minimalist house/building forms.",
    suffix: "The final logo must convey a strong sense of reliability and premium quality. It should be clean, scalable, and look impeccable on both digital platforms and physical materials like business cards and signage."
  },

  kids: {
    prefix: "You are a cheerful children's book illustrator and toy designer. Create a fun and friendly 'Kids & Toys' theme logo for:",
    styleElements: "Core Principles: Playfulness, Imagination, Safety, and Joy. Design Elements: Typography must be soft, approachable, and easy to read, using rounded sans-serifs, bubbly letters, or a friendly, handwritten style. The color palette should be bright and vibrant, featuring primary colors or soft pastels to create a welcoming and energetic feel. Imagery should be simple and charming: cute animal mascots, smiling characters, basic shapes like stars or clouds, or stylized toys like blocks and rockets.",
    suffix: "The logo needs to be instantly appealing to both children and parents. It must be safe, friendly, and full of personality, sparking a sense of fun and adventure. Ensure the design is simple enough to be easily recognizable and reproducible on packaging."
  },

  futuristic: {
    prefix: "You are a sci-fi concept artist and a specialist in high-tech branding. Design a visionary 'Futuristic' theme logo for:",
    styleElements: "Core Principles: Innovation, Advancement, Sleekness, and Vision. Design Elements: Typography should be cutting-edge, utilizing geometric sans-serifs, extended character spacing, or even custom digital or glitch-style fonts. The color palette should be electric and dynamic—neon blues, vibrant greens, silver chrome, deep space blacks, and energetic light streaks. Imagery should draw from sci-fi motifs: planetary rings, circuit board patterns, sleek rocket silhouettes, abstract data flows, or atomic structures.",
    suffix: "The logo must look like it's from the future. It needs to be sharp, intelligent, and dynamic, conveying a sense of forward-thinking technology and limitless possibility. Generate a high-tech, polished design suitable for a groundbreaking brand."
  }
}
};

// Function to refine user prompt using Llama model
export const refinePrompt = async (request: PromptRefinementRequest): Promise<string> => {
  const categoryInfo = stylePrompts[request.category as keyof typeof stylePrompts];
  const categoryName = request.category.charAt(0).toUpperCase() + request.category.slice(1);

  const refinementPrompt = `You are an expert brand strategist and logo design consultant. Your task is to enhance and refine a user's logo description to make it more specific, compelling, and suitable for AI logo generation.

Original user description: ${request.originalPrompt}
Logo style category: ${categoryName}

${categoryInfo ? `Style context: ${categoryInfo.styleElements}` : ''}

Please refine this description by:
1. Adding specific industry details and business context
2. Clarifying the brand personality and values
3. Suggesting appropriate visual elements that would work well for ${categoryName} style
4. Making the description more detailed and actionable for logo creation
5. Ensuring the refined prompt is optimized for AI image generation

Guidelines:
- Keep the core business idea from the original prompt
- Add 2-3 specific visual or stylistic suggestions
- Include relevant industry keywords
- Make it 2-3 sentences long
- Focus on elements that translate well to logo design

Provide only the refined prompt without any quotes or additional formatting.`;

  try {
    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'accounts/fireworks/models/llama4-scout-instruct-basic',
        messages: [
          {
            role: 'user',
            content: refinementPrompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fireworks AI Llama API error:', response.status, errorData);
      throw new Error(`Fireworks AI API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Invalid response format from Llama:', data);
      throw new Error('Invalid response format from Fireworks AI');
    }

    let refinedPrompt = data.choices[0].message.content.trim();
    
    // Remove any quotes that might be present in the response
    refinedPrompt = refinedPrompt.replace(/^["']|["']$/g, '');
    
    console.log('Original prompt:', request.originalPrompt);
    console.log('Refined prompt:', refinedPrompt);
    
    return refinedPrompt;
  } catch (error) {
    console.error('Error refining prompt:', error);
    // Return original prompt if refinement fails
    return request.originalPrompt;
  }
};

// Function to create a tailored prompt based on style and user input
const createTailoredPrompt = (userPrompt: string, category: string, aspectRatio?: string): string => {
  const style = stylePrompts[category as keyof typeof stylePrompts];

  if (!style) {
    // Fallback for unknown categories
    return `Create a professional logo for: ${userPrompt}. Make it clean, modern, and suitable for business use. Vector-style, simple but impactful design.`;
  }

  // Add aspect ratio specific instructions
  let aspectRatioInstructions = '';
  if (aspectRatio) {
    switch (aspectRatio) {
      case '1:1':
        aspectRatioInstructions = ' Optimize for square format - ensure the design is centered and balanced within a square frame.';
        break;
      case '16:9':
        aspectRatioInstructions = ' Optimize for landscape format - design should work well horizontally, perfect for headers and banners.';
        break;
      case '9:16':
        aspectRatioInstructions = ' Optimize for portrait format - design should work well vertically, ideal for mobile displays.';
        break;
      case '4:3':
        aspectRatioInstructions = ' Optimize for standard presentation format - balanced proportions suitable for traditional media.';
        break;
      case '3:2':
        aspectRatioInstructions = ' Optimize for photo proportions - classic rectangular format with slight horizontal emphasis.';
        break;
      case '21:9':
        aspectRatioInstructions = ' Optimize for ultra-wide format - design should work as a cinematic banner with horizontal emphasis.';
        break;
      case '5:4':
        aspectRatioInstructions = ' Optimize for print format - slightly taller than wide, perfect for print materials.';
        break;
      case '2:3':
        aspectRatioInstructions = ' Optimize for poster format - vertical orientation ideal for posters and tall displays.';
        break;
    }
  }

  // Combine all elements into a comprehensive prompt
  const tailoredPrompt = `${style.prefix} ${userPrompt}. 

Style Requirements: ${style.styleElements}

Final Output: ${style.suffix}${aspectRatioInstructions}

Additional Guidelines:
- Ensure the logo is scalable and works in both color and monochrome
- Avoid overly complex details that won't be visible at small sizes
- Create a design that's memorable and unique to the business
- The logo should work across digital and print media
- Focus on professional quality and commercial viability`;

  return tailoredPrompt;
};

export const generateLogo = async (request: LogoGenerationRequest): Promise<string> => {
  // Create the tailored prompt based on user input and selected style
  const enhancedPrompt = createTailoredPrompt(request.prompt, request.category, request.aspectRatio);

  console.log('Generated tailored prompt:', enhancedPrompt);
  console.log('Generation parameters:', {
    aspectRatio: request.aspectRatio,
    guidanceScale: request.guidanceScale,
    numInferenceSteps: request.numInferenceSteps,
    seed: request.seed
  });

  try {
    const requestBody = {
      prompt: enhancedPrompt,
      negative_prompt: "blurry, low quality, pixelated, distorted, watermark, text overlay, signature, copyright, multiple logos, cluttered, busy design, poor typography, amateur, unprofessional",
      aspect_ratio: request.aspectRatio || "1:1",
      guidance_scale: request.guidanceScale || 3.5,
      num_inference_steps: request.numInferenceSteps || 30,
      seed: request.seed || Math.floor(Math.random() * 2147483647)
    };

    console.log('API Request Body:', requestBody);

    const response = await fetch('https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fireworks AI API error:', response.status, errorData);
      throw new Error(`Fireworks AI API error: ${response.statusText}`);
    }

    // Check the content type to determine how to handle the response
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.startsWith('image/')) {
      // Handle direct binary image response
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      return imageUrl;
    } else {
      // Handle JSON response with URL
      const data = await response.json();

      if (!data.data || !data.data[0] || !data.data[0].url) {
        console.error('Invalid response format:', data);
        throw new Error('Invalid response format from Fireworks AI');
      }

      return data.data[0].url;
    }
  } catch (error) {
    console.error('Error generating logo:', error);

    // Enhanced fallback with category-specific placeholder
    const categoryImages = {
      tech: 'https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=1024&h=1024&fit=crop',
      professional: 'https://images.pexels.com/photos/1181677/pexels-photo-1181677.jpeg?auto=compress&cs=tinysrgb&w=1024&h=1024&fit=crop',
      sports: 'https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&cs=tinysrgb&w=1024&h=1024&fit=crop',
      minimalist: 'https://images.pexels.com/photos/1181673/pexels-photo-1181673.jpeg?auto=compress&cs=tinysrgb&w=1024&h=1024&fit=crop',
      abstract: 'https://images.pexels.com/photos/1181674/pexels-photo-1181674.jpeg?auto=compress&cs=tinysrgb&w=1024&h=1024&fit=crop',
      nature: 'https://images.pexels.com/photos/1181676/pexels-photo-1181676.jpeg?auto=compress&cs=tinysrgb&w=1024&h=1024&fit=crop',
      food: 'https://images.pexels.com/photos/1181672/pexels-photo-1181672.jpeg?auto=compress&cs=tinysrgb&w=1024&h=1024&fit=crop'
    };

    return categoryImages[request.category as keyof typeof categoryImages] || categoryImages.tech;
  }
};

// Export the prompt creation function for testing/debugging
export { createTailoredPrompt };