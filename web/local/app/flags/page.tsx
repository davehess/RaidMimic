import LocalFlags from './LocalFlags';

export const metadata = {
  title: 'PoP flags · On this PC',
  description: 'Your Planes of Power flags and what each character needs next, read from the files and logs on this PC.',
};

export default function FlagsPage() {
  return <LocalFlags />;
}
