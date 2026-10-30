import { Suspense } from 'react';
import { ApplyForm } from './apply-form';

export default function Page() {
  return (
    <Suspense>
      <ApplyForm />
    </Suspense>
  );
}
