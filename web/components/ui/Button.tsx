import Link from 'next/link';

// primary = the one action on the page, default = everything else, ghost = quiet. `sm` for toolbars and table rows.
// Tap target stays 40px (32px for sm) tall: a raider reaches for these on a phone.
type Variant = 'primary' | 'default' | 'ghost';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-bone border-accent hover:bg-accent/85',
  default: 'bg-raised text-text border-border hover:border-text3',
  ghost:   'bg-transparent text-text2 border-transparent hover:bg-raised hover:text-text',
};

export default function Button({ variant = 'default', sm = false, href, className = '', children, ...rest }: {
  variant?: Variant; sm?: boolean; href?: string; className?: string; children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>) {
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-md border font-medium no-underline hover:no-underline disabled:opacity-50 ${
    sm ? 'min-h-[32px] px-2.5 text-xs' : 'min-h-[40px] px-4 text-sm'} ${VARIANT[variant]} ${className}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" className={cls} {...rest}>{children}</button>;
}
