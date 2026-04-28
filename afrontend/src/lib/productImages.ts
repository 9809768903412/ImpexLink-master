const PRODUCT_IMAGE_BASE = '/product-images/';

const productImageMap: Record<string, string> = {
  'baby roller': 'baby roller 4_.jpg',
  'baby roller cotton': 'baby roller 4_.jpg',
  'cerami tech e.g': 'Cerami tech E.G..jpg',
  'cerami-tech e.g': 'Cerami tech E.G..jpg',
  'cerami tech f.g': 'Cerami tech F.G..jpg',
  'cerami-tech f.g': 'Cerami tech F.G..jpg',
  'ceramic tech eg': 'Cerami tech E.G..jpg',
  'ceramic tech fg': 'Cerami tech F.G..jpg',
  'chopped strand matt 230': 'Chopped Strand matt 230.jpg',
  'chipping gun': 'https://commons.wikimedia.org/wiki/Special:FilePath/Aa_pneumatic_drill_compressor_front.jpg?width=800',
  'cotton gloves plain': 'cotton gloves plain.jpg',
  'cotton rags': 'cotton rags.jpg',
  'empty sacks': 'https://commons.wikimedia.org/wiki/Special:FilePath/Feed_sack.png?width=800',
  'floortech sp injectable': 'Floortech SP injectable.jpg',
  ftsp: 'Floortech SP injectable.jpg',
  'hand drill': 'https://commons.wikimedia.org/wiki/Special:FilePath/Cordless_Electric_Drill.jpg?width=800',
  'injection machine': 'injection machine.jpg',
  'epoxy injection': 'Floortech SP injectable.jpg',
  'lacquer thinner': 'lacquer thinner.jpg',
  'metal tech e.g': 'metal tech E.G..jpg',
  'metal-tech e.g': 'metal tech E.G..jpg',
  'metal tech eg': 'metal tech E.G..jpg',
  'mini roller': 'mini roller 4_.jpg',
  'paint brush 1': 'paint brush 2_.jpg',
  'paint brush 1-1/2': 'paint brush 2_.jpg',
  'paint brush 2': 'paint brush 2_.jpg',
  'paint brush 3': 'paint brush 3_.jpg',
  'paint roller 7': 'paint roller 7_.jpg',
  'roller filler': 'paint roller filler 7_.jpg',
  'paint thinner': 'paint thinner.jpg',
  'palette pair 4': 'palette 4_.jpg',
  'palette pair 6': 'palette with handle.jpg',
  'palette 4': 'palette 4_.jpg',
  'palette with handle': 'palette with handle.jpg',
  'patching compound': 'patching compound.jpg',
  'poly tech csm': 'Chopped Strand matt 230.jpg',
  'portable grinder': 'https://commons.wikimedia.org/wiki/Special:FilePath/AngleGrinder.jpg?width=800',
  'safety gloves with rubber': 'safety gloves with rubber.jpg',
  'safety gloves': 'Safety Gloves.jpg',
  'sand paper #100': 'https://commons.wikimedia.org/wiki/Special:FilePath/Sandpaper.jpg?width=800',
  'sand paper 100': 'https://commons.wikimedia.org/wiki/Special:FilePath/Sandpaper.jpg?width=800',
  'sand paper #120': 'https://commons.wikimedia.org/wiki/Special:FilePath/Sandpaper.jpg?width=800',
  'sand paper 120': 'https://commons.wikimedia.org/wiki/Special:FilePath/Sandpaper.jpg?width=800',
  'sand paper #150': 'sandpaper #150.jpg',
  'sand paper 150': 'sandpaper #150.jpg',
  'sand paper #180': 'sandpaper #180.jpg',
  'sand paper 180': 'sandpaper #180.jpg',
  'sandpaper #150': 'sandpaper #150.jpg',
  'sandpaper 150': 'sandpaper #150.jpg',
  'sandpaper #180': 'sandpaper #180.jpg',
  'sandpaper 180': 'sandpaper #180.jpg',
  'sandpaper #240': 'sandpaper #240.jpg',
  'sandpaper 240': 'sandpaper #240.jpg',
  'sandpaper #360': 'sandpaper #360.jpg',
  'sandpaper 360': 'sandpaper #360.jpg',
  'seal tech aw': 'patching compound.jpg',
  'spatula': 'https://commons.wikimedia.org/wiki/Special:FilePath/PuttyKnife.JPG?width=800',
  'steel brush': 'https://commons.wikimedia.org/wiki/Special:FilePath/500px_photo_(31567459).jpeg?width=800',
  'welding machine': 'https://commons.wikimedia.org/wiki/Special:FilePath/Welding_Machine_001.jpg?width=800',
};

function normalizeProductName(name: string) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function getProductImageUrl(name?: string | null) {
  if (!name) return null;
  const normalized = normalizeProductName(name);
  const exact = productImageMap[normalized];
  if (exact) {
    return /^https?:\/\//.test(exact) ? exact : `${PRODUCT_IMAGE_BASE}${encodeURIComponent(exact)}`;
  }

  const match = Object.entries(productImageMap).find(([key]) => normalized.includes(key));
  if (!match) return null;
  return /^https?:\/\//.test(match[1]) ? match[1] : `${PRODUCT_IMAGE_BASE}${encodeURIComponent(match[1])}`;
}
