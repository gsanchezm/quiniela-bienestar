import { AuthShell } from '@/components/auth/AuthShell';
import { ResetForm } from './ResetForm';

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell title="Nueva contraseña" kicker="ÚLTIMO TOQUE" backHref="/login">
      <ResetForm token={token} />
    </AuthShell>
  );
}
