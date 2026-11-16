// Status chips. Colour is MEANING only: green = good/kill, gold = warning/DKP, red = bad/dead, blue = info, grey = neutral.
// The label always says the status in words too, so colour is never the only carrier.
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE: Record<Tone, string> = {
  success: 'border-green/40 bg-green/10 text-green',
  warning: 'border-gold/40 bg-gold/10 text-gold',
  danger:  'border-red/40 bg-red/10 text-red',
  info:    'border-blue/40 bg-blue/10 text-blue',
  neutral: 'border-border bg-raised text-text2',
};

export default function Chip({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${TONE[tone]}`}>
      {children}
    </span>
  );
}
