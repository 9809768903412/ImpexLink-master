import { Package } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getProductImageUrl } from '@/lib/productImages';

type ProductImageProps = {
  name?: string | null;
  className?: string;
  imageClassName?: string;
  iconSize?: number;
};

export function ProductImage({ name, className, imageClassName, iconSize = 24 }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const url = !failed ? getProductImageUrl(name) : null;

  return (
    <div className={cn('flex items-center justify-center overflow-hidden rounded-md bg-white', className)}>
      {url ? (
        <img
          src={url}
          alt={name || 'Product'}
          loading="lazy"
          className={cn('h-full w-full object-contain', imageClassName)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#f8fafc] text-muted-foreground">
          <Package size={iconSize} />
        </div>
      )}
    </div>
  );
}
