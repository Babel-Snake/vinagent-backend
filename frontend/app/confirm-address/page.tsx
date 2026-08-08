import type { Metadata } from 'next';

import ConfirmAddress from '../../components/public/ConfirmAddress';

export const metadata: Metadata = {
  title: 'Confirm address update | VinAgent',
  description: 'Review and confirm a requested address update.',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function ConfirmAddressPage() {
  return <ConfirmAddress />;
}

