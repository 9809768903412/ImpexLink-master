interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { logo: 'h-8 w-8', text: 'text-base' },
  md: { logo: 'h-10 w-10', text: 'text-lg' },
  lg: { logo: 'h-14 w-14', text: 'text-2xl' },
  xl: { logo: 'h-20 w-20', text: 'text-4xl' },
};

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const { logo, text } = sizeMap[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`${logo} flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-black`}>
        <img
          src="/brand/impex-engineering-logo.jpeg"
          alt="Impex Engineering"
          className="h-full w-full object-contain"
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`font-bold text-foreground ${text}`}>Impex Engineering</span>
          {size === 'lg' || size === 'xl' ? (
            <span className="text-xs text-muted-foreground tracking-wide">
              Engineering and Industrial Supply
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
