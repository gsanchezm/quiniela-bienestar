import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotForm } from './ForgotForm';

export default function OlvidePage() {
  return (
    <AuthShell title="Recuperar contraseña" kicker="TIEMPO FUERA" backHref="/login">
      <ForgotForm />
    </AuthShell>
  );
}
