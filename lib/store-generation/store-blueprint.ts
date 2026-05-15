import { z } from "zod";

export const ThemeDirectionSchema = z.object({
  name: z.string().min(1),
  primaryColor: z.string().min(1),
  accentColor: z.string().min(1),
  backgroundColor: z.string().min(1),
  textColor: z.string().min(1),
  mood: z.string().min(1),
});

export const ColorPaletteSchema = z.object({
  name: z.string().min(1),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  usage: z.string().min(1),
});

export const ProductSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  price: z.string().min(1),
  currencyCode: z.string().min(1),
  imageUrl: z.url(),
  imageAlt: z.string().min(1),
  imagePrompt: z.string().min(1),
});

export const StoreBlueprintSchema = z.object({
  storeName: z.string().min(1),
  businessIdea: z.string().min(1),
  tagline: z.string().min(1),
  targetAudience: z.string().min(1),
  visualDirection: z.string().min(1),
  colorPalette: z.array(ColorPaletteSchema).min(3).max(6),
  catalogStrategy: z.string().min(1),
  homepageHeadline: z.string().min(1),
  homepageSubheading: z.string().min(1),
  brandVoice: z.string().min(1),
  theme: ThemeDirectionSchema,
  products: z.array(ProductSchema).min(1).max(7),
  heroProductId: z.string().min(1),
  heroProduct: z.string().min(1),
  heroImagePrompt: z.string().min(1),
});

export type ThemeDirection = z.infer<typeof ThemeDirectionSchema>;
export type ColorPalette = z.infer<typeof ColorPaletteSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type StoreBlueprint = z.infer<typeof StoreBlueprintSchema>;

export function generateStoreBlueprintFromPrompt(prompt: string): StoreBlueprint {
  const cleanedPrompt = prompt.trim();
  const productCount = inferProductCount(cleanedPrompt);
  const brandName = createBrandName(cleanedPrompt);
  const theme = chooseTheme(cleanedPrompt);
  const products = createProducts(brandName, cleanedPrompt, productCount);
  const heroProduct = products[0];

  return StoreBlueprintSchema.parse({
    storeName: brandName,
    businessIdea: cleanedPrompt,
    tagline: createTagline(cleanedPrompt),
    targetAudience: createTargetAudience(cleanedPrompt),
    visualDirection: `${theme.mood}. Clean commerce layout, confident product photography, and restrained premium details.`,
    colorPalette: [
      {
        name: "Primary",
        hex: theme.primaryColor,
        usage: "Navigation, headings, and primary launch moments.",
      },
      {
        name: "Accent",
        hex: theme.accentColor,
        usage: "Buttons, badges, price emphasis, and selected states.",
      },
      {
        name: "Canvas",
        hex: theme.backgroundColor,
        usage: "Page background and spacious merchandising sections.",
      },
      {
        name: "Ink",
        hex: theme.textColor,
        usage: "Body copy, product details, and high-contrast labels.",
      },
    ],
    catalogStrategy: `Launch with ${productCount} focused product${productCount === 1 ? "" : "s"} that make the idea instantly legible, led by one hero SKU and supported by tight, benefit-led copy.`,
    homepageHeadline: createHomepageHeadline(cleanedPrompt),
    homepageSubheading:
      "A concise storefront concept with a small catalog, clear brand world, and a stable path toward commerce transformation.",
    brandVoice: createBrandVoice(cleanedPrompt),
    theme,
    products,
    heroProductId: heroProduct.id,
    heroProduct: heroProduct.title,
    heroImagePrompt: `${heroProduct.imagePrompt} Cinematic ecommerce hero image, premium lighting, uncluttered background, no text.`,
  });
}

export function createMockStoreBlueprint(): StoreBlueprint {
  return StoreBlueprintSchema.parse({
    storeName: "Northstar Provisions",
    businessIdea:
      "A polished outdoor essentials storefront for compact, design-forward expedition gear.",
    tagline: "Field-tested goods for weekends that start before sunrise.",
    targetAudience:
      "Weekend hikers, design-conscious campers, and city dwellers buying durable outdoor gear.",
    visualDirection:
      "Alpine graphite surfaces, crisp product photography, teal active-state accents, and generous negative space.",
    colorPalette: [
      {
        name: "Graphite",
        hex: "#111827",
        usage: "Navigation, typography, and premium product framing.",
      },
      {
        name: "Trail Teal",
        hex: "#2DD4BF",
        usage: "Primary calls to action and active merchandising accents.",
      },
      {
        name: "Snowfield",
        hex: "#F8FAFC",
        usage: "Page canvas and product gallery backgrounds.",
      },
      {
        name: "Slate Ink",
        hex: "#0F172A",
        usage: "Body copy and high-contrast detail text.",
      },
    ],
    catalogStrategy:
      "Launch with three practical hero products that show the brand range without overwhelming the storefront.",
    homepageHeadline: "Pack lighter. Go farther.",
    homepageSubheading:
      "A focused catalog of durable trail goods, tuned for crisp mornings, clean design, and dependable checkout.",
    brandVoice: "Calm, capable, precise, and premium without feeling fragile.",
    theme: {
      name: "Alpine graphite",
      primaryColor: "#111827",
      accentColor: "#2dd4bf",
      backgroundColor: "#f8fafc",
      textColor: "#0f172a",
      mood: "restrained, technical, bright accents, lots of breathing room",
    },
    products: [
      {
        id: "northstar-shell-pack",
        handle: "shell-pack",
        title: "Shell Pack 18L",
        description:
          "A weather-resistant day pack with a structured profile and quick-access field pockets.",
        price: "148.00",
        currencyCode: "USD",
        imageUrl:
          "https://images.unsplash.com/photo-1622260614153-03223fb72052?auto=format&fit=crop&w=1200&q=80",
        imageAlt: "A compact technical backpack resting on pale rock.",
        imagePrompt:
          "Compact graphite technical backpack on pale granite, alpine morning light, premium ecommerce product photography.",
      },
      {
        id: "northstar-thermal-flask",
        handle: "thermal-flask",
        title: "Thermal Trail Flask",
        description:
          "A matte insulated bottle sized for glove-friendly handling and all-day heat retention.",
        price: "42.00",
        currencyCode: "USD",
        imageUrl:
          "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=80",
        imageAlt: "A dark reusable flask against a clean outdoor backdrop.",
        imagePrompt:
          "Matte insulated trail flask on a clean outdoor table, cool daylight, premium catalog photography.",
      },
      {
        id: "northstar-camp-lantern",
        handle: "camp-lantern",
        title: "Dawnline Lantern",
        description:
          "A compact rechargeable lantern with warm diffusion for tent, table, and trailhead use.",
        price: "64.00",
        currencyCode: "USD",
        imageUrl:
          "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
        imageAlt: "A warm campsite lantern glowing near outdoor gear.",
        imagePrompt:
          "Compact warm camp lantern glowing beside neatly arranged trail gear at dawn, cinematic ecommerce hero.",
      },
    ],
    heroProductId: "northstar-shell-pack",
    heroProduct: "Shell Pack 18L",
    heroImagePrompt:
      "Compact graphite technical backpack on pale granite, alpine morning light, premium ecommerce hero image, no text.",
  });
}

function inferProductCount(prompt: string) {
  const explicitCount = prompt.match(
    /\b([1-7])(?:\s+\w+){0,2}\s+(products?|skus?|items?|kits?)\b/i,
  );

  if (explicitCount?.[1]) {
    return Number(explicitCount[1]);
  }

  const wordCount = prompt.match(
    /\b(one|two|three|four|five|six|seven)(?:\s+\w+){0,2}\s+(products?|skus?|items?|kits?)\b/i,
  );

  if (wordCount?.[1]) {
    return WORD_COUNTS[wordCount[1].toLowerCase() as keyof typeof WORD_COUNTS];
  }

  if (/\b(single|one|solo)\b/i.test(prompt)) {
    return 1;
  }

  if (/\bcollection|kit|bundle|range|line\b/i.test(prompt)) {
    return 5;
  }

  return 3;
}

function createBrandName(prompt: string) {
  const quoted = prompt.match(/["“]([^"”]{3,40})["”]/);

  if (quoted?.[1]) {
    return titleCase(quoted[1]);
  }

  const cleaned = prompt
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !COMMON_WORDS.has(word.toLowerCase()))
    .slice(0, 2)
    .join(" ");

  return `${titleCase(cleaned || "StoreForge")} ${brandSuffix(prompt)}`;
}

function createTagline(prompt: string) {
  if (/\b(coffee|tea|matcha|cafe)\b/i.test(prompt)) {
    return "Small-batch rituals for better everyday mornings.";
  }

  if (/\b(skincare|beauty|wellness|soap)\b/i.test(prompt)) {
    return "Clean essentials with a polished daily rhythm.";
  }

  if (/\b(pet|dog|cat)\b/i.test(prompt)) {
    return "Thoughtful goods for companions with character.";
  }

  if (/\b(outdoor|camp|trail|hike|travel)\b/i.test(prompt)) {
    return "Field-ready goods for days that start early.";
  }

  return "A focused storefront for products with a clear point of view.";
}

function createTargetAudience(prompt: string) {
  if (/\b(luxury|premium|high end|designer)\b/i.test(prompt)) {
    return "Design-conscious shoppers who value premium materials, restraint, and confident presentation.";
  }

  if (/\b(parent|baby|kid|family)\b/i.test(prompt)) {
    return "Busy families looking for dependable products, simple choices, and warm guidance.";
  }

  if (/\b(outdoor|camp|trail|hike|travel)\b/i.test(prompt)) {
    return "Active shoppers who want durable products, fast comparison, and credible merchandising.";
  }

  return "Early adopters and intentional shoppers looking for a curated, easy-to-understand product line.";
}

function chooseTheme(prompt: string): ThemeDirection {
  if (/\b(coffee|tea|bakery|candle)\b/i.test(prompt)) {
    return {
      name: "Roasted warmth",
      primaryColor: "#1F2937",
      accentColor: "#D97706",
      backgroundColor: "#FFFBEB",
      textColor: "#111827",
      mood: "warm editorial neutrals with a grounded amber accent",
    };
  }

  if (/\b(skincare|beauty|wellness|spa)\b/i.test(prompt)) {
    return {
      name: "Clean mineral",
      primaryColor: "#164E63",
      accentColor: "#14B8A6",
      backgroundColor: "#F0FDFA",
      textColor: "#0F172A",
      mood: "fresh, clinical, calm, and luminous",
    };
  }

  if (/\b(outdoor|camp|trail|hike|travel)\b/i.test(prompt)) {
    return {
      name: "Alpine graphite",
      primaryColor: "#111827",
      accentColor: "#2DD4BF",
      backgroundColor: "#F8FAFC",
      textColor: "#0F172A",
      mood: "restrained, technical, bright accents, lots of breathing room",
    };
  }

  return {
    name: "Studio contrast",
    primaryColor: "#18181B",
    accentColor: "#2563EB",
    backgroundColor: "#FAFAFA",
    textColor: "#18181B",
    mood: "modern, direct, high-contrast, and product-led",
  };
}

function createProducts(brandName: string, prompt: string, count: number) {
  const category = inferCategory(prompt);
  const templates = PRODUCT_TEMPLATES[category] ?? PRODUCT_TEMPLATES.general;

  return Array.from({ length: count }, (_, index) => {
    const template = templates[index % templates.length];
    const title = template.title;

    return {
      id: `${slugify(brandName)}-${template.handle}`,
      handle: template.handle,
      title,
      description: template.description,
      price: template.price,
      currencyCode: "USD",
      imageUrl: template.imageUrl,
      imageAlt: template.imageAlt,
      imagePrompt: `${title} for ${brandName}. ${template.imagePrompt}`,
    };
  });
}

function createHomepageHeadline(prompt: string) {
  if (/\b(coffee|tea|matcha|cafe)\b/i.test(prompt)) {
    return "Make the morning worth keeping.";
  }

  if (/\b(skincare|beauty|wellness)\b/i.test(prompt)) {
    return "Clean care, clearly chosen.";
  }

  if (/\b(outdoor|camp|trail|hike|travel)\b/i.test(prompt)) {
    return "Pack lighter. Go farther.";
  }

  return "A sharper way to shop the essentials.";
}

function createBrandVoice(prompt: string) {
  if (/\b(playful|fun|kids|pet)\b/i.test(prompt)) {
    return "Bright, friendly, concise, and useful.";
  }

  if (/\b(luxury|premium|designer)\b/i.test(prompt)) {
    return "Polished, minimal, assured, and editorial.";
  }

  return "Clear, confident, benefit-led, and restrained.";
}

function inferCategory(prompt: string) {
  if (/\b(coffee|tea|matcha|cafe)\b/i.test(prompt)) return "coffee";
  if (/\b(skincare|beauty|wellness|soap)\b/i.test(prompt)) return "wellness";
  if (/\b(outdoor|camp|trail|hike|travel)\b/i.test(prompt)) return "outdoor";
  if (/\b(pet|dog|cat)\b/i.test(prompt)) return "pet";
  return "general";
}

function brandSuffix(prompt: string) {
  if (/\b(coffee|tea|cafe|bakery)\b/i.test(prompt)) return "Roasters";
  if (/\b(skincare|beauty|wellness|soap)\b/i.test(prompt)) return "Studio";
  if (/\b(outdoor|camp|trail|hike|travel)\b/i.test(prompt)) return "Provisions";
  if (/\b(pet|dog|cat)\b/i.test(prompt)) return "Goods";
  return "Market";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

const COMMON_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "store",
  "shop",
  "brand",
  "selling",
  "that",
  "with",
  "the",
  "to",
  "of",
]);

const WORD_COUNTS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
} as const;

const PRODUCT_TEMPLATES = {
  coffee: [
    {
      handle: "morning-blend",
      title: "Morning Blend",
      description: "A balanced flagship blend designed for everyday brewing.",
      price: "24.00",
      imageUrl:
        "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "Fresh roasted coffee beans on a dark surface.",
      imagePrompt:
        "premium bag of coffee beans on a warm neutral counter, soft morning light",
    },
    {
      handle: "ceramic-dripper",
      title: "Ceramic Dripper",
      description: "A clean pour-over tool for slow, precise cups.",
      price: "38.00",
      imageUrl:
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A hand pouring coffee into a ceramic cup.",
      imagePrompt:
        "minimal ceramic coffee dripper with steam, editorial ecommerce photo",
    },
    {
      handle: "travel-tumbler",
      title: "Travel Tumbler",
      description: "An insulated tumbler for coffee that leaves the kitchen.",
      price: "32.00",
      imageUrl:
        "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A coffee cup on a clean cafe table.",
      imagePrompt:
        "matte insulated coffee tumbler on cafe table, natural light, premium",
    },
  ],
  wellness: [
    {
      handle: "daily-cleanser",
      title: "Daily Cleanser",
      description: "A gentle cleanser positioned as the first step in a clear routine.",
      price: "28.00",
      imageUrl:
        "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "Minimal skincare bottles on a clean bathroom surface.",
      imagePrompt:
        "minimal skincare cleanser bottle on pale stone, soft clinical lighting",
    },
    {
      handle: "mineral-serum",
      title: "Mineral Serum",
      description: "A lightweight hero serum with a polished, premium feel.",
      price: "58.00",
      imageUrl:
        "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A skincare serum bottle with a dropper.",
      imagePrompt:
        "premium serum dropper bottle with water reflections, fresh teal accent",
    },
    {
      handle: "recovery-cream",
      title: "Recovery Cream",
      description: "A finishing cream for calm, consistent daily care.",
      price: "46.00",
      imageUrl:
        "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A cream jar on a neutral surface.",
      imagePrompt:
        "minimal cream jar on clean counter, spa-inspired light, premium ecommerce",
    },
  ],
  outdoor: [
    {
      handle: "shell-pack",
      title: "Shell Pack 18L",
      description:
        "A weather-resistant day pack with quick-access field pockets.",
      price: "148.00",
      imageUrl:
        "https://images.unsplash.com/photo-1622260614153-03223fb72052?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A compact technical backpack resting on pale rock.",
      imagePrompt:
        "compact graphite technical backpack on pale granite, alpine morning light",
    },
    {
      handle: "thermal-flask",
      title: "Thermal Trail Flask",
      description:
        "A matte insulated bottle sized for glove-friendly handling.",
      price: "42.00",
      imageUrl:
        "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A dark reusable flask against a clean outdoor backdrop.",
      imagePrompt:
        "matte insulated flask on outdoor table, cool daylight, premium catalog",
    },
    {
      handle: "camp-lantern",
      title: "Dawnline Lantern",
      description:
        "A compact rechargeable lantern with warm diffusion for camp setups.",
      price: "64.00",
      imageUrl:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A warm campsite lantern glowing near outdoor gear.",
      imagePrompt:
        "warm camp lantern glowing beside arranged trail gear at dawn",
    },
  ],
  pet: [
    {
      handle: "daily-walk-kit",
      title: "Daily Walk Kit",
      description: "A coordinated leash and pouch set for polished everyday walks.",
      price: "54.00",
      imageUrl:
        "https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A dog walking outdoors with a simple leash.",
      imagePrompt:
        "premium dog walking kit, clean studio-meets-park product photography",
    },
    {
      handle: "soft-rest-mat",
      title: "Soft Rest Mat",
      description: "A washable rest mat that fits home, car, and travel routines.",
      price: "72.00",
      imageUrl:
        "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "Two dogs sitting outdoors.",
      imagePrompt:
        "minimal premium pet rest mat in a warm home setting, natural light",
    },
    {
      handle: "treat-tin",
      title: "Pocket Treat Tin",
      description: "A refillable tin for small training rewards on the move.",
      price: "18.00",
      imageUrl:
        "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A small dog looking toward treats.",
      imagePrompt:
        "small premium treat tin beside dog accessories, bright friendly ecommerce",
    },
  ],
  general: [
    {
      handle: "signature-kit",
      title: "Signature Kit",
      description: "A focused hero product that makes the storefront promise tangible.",
      price: "68.00",
      imageUrl:
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A clean product arrangement on a pale background.",
      imagePrompt:
        "signature product kit on pale studio background, sharp premium ecommerce",
    },
    {
      handle: "daily-essential",
      title: "Daily Essential",
      description: "A useful supporting SKU with clear everyday value.",
      price: "34.00",
      imageUrl:
        "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A minimal lifestyle product scene.",
      imagePrompt:
        "daily essential product in minimal lifestyle scene, clean natural light",
    },
    {
      handle: "gift-bundle",
      title: "Gift Bundle",
      description: "A small bundle designed to lift average order value.",
      price: "96.00",
      imageUrl:
        "https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "A curated bundle with premium packaging.",
      imagePrompt:
        "curated ecommerce gift bundle with premium packaging and crisp shadows",
    },
  ],
} as const;
