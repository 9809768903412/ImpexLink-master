const PRODUCT_IMAGE_BASE = '/product-images/';

const productImageMap: Record<string, string> = {
  'baby roller': 'baby roller 4_.jpg',
  'cerami tech e.g': 'Cerami tech E.G..jpg',
  'cerami-tech e.g': 'Cerami tech E.G..jpg',
  'cerami tech f.g': 'Cerami tech F.G..jpg',
  'cerami-tech f.g': 'Cerami tech F.G..jpg',
  'chopped strand matt 230': 'Chopped Strand matt 230.jpg',
  'cotton gloves plain': 'cotton gloves plain.jpg',
  'cotton rags': 'cotton rags.jpg',
  'floortech sp injectable': 'Floortech SP injectable.jpg',
  ftsp: 'Floortech SP injectable.jpg',
  'injection machine': 'injection machine.jpg',
  'lacquer thinner': 'lacquer thinner.jpg',
  'metal tech e.g': 'metal tech E.G..jpg',
  'metal-tech e.g': 'metal tech E.G..jpg',
  'mini roller': 'mini roller 4_.jpg',
  'paint brush 2': 'paint brush 2_.jpg',
  'paint brush 3': 'paint brush 3_.jpg',
  'paint roller 7': 'paint roller 7_.jpg',
  'roller filler': 'paint roller filler 7_.jpg',
  'paint thinner': 'paint thinner.jpg',
  'palette 4': 'palette 4_.jpg',
  'palette with handle': 'palette with handle.jpg',
  'patching compound': 'patching compound.jpg',
  'safety gloves with rubber': 'safety gloves with rubber.jpg',
  'safety gloves': 'Safety Gloves.jpg',
  'sandpaper #150': 'sandpaper #150.jpg',
  'sandpaper 150': 'sandpaper #150.jpg',
  'sandpaper #180': 'sandpaper #180.jpg',
  'sandpaper 180': 'sandpaper #180.jpg',
  'sandpaper #240': 'sandpaper #240.jpg',
  'sandpaper 240': 'sandpaper #240.jpg',
  'sandpaper #360': 'sandpaper #360.jpg',
  'sandpaper 360': 'sandpaper #360.jpg',
};

function normalizeProductName(name: string) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function getProductImageUrl(name?: string | null) {
  if (!name) return null;
  const normalized = normalizeProductName(name);
  const exact = productImageMap[normalized];
  if (exact) return `${PRODUCT_IMAGE_BASE}${encodeURIComponent(exact)}`;

  const match = Object.entries(productImageMap).find(([key]) => normalized.includes(key));
  return match ? `${PRODUCT_IMAGE_BASE}${encodeURIComponent(match[1])}` : null;
}
