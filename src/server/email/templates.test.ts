import { describe, it, expect } from 'vitest';
import { confirmEmail, resetEmail, changeEmailEmail } from './templates';

const URL = 'https://quiniela.example/confirmar/abc123';

describe('plantillas de correo', () => {
  it.each([
    ['confirmación', confirmEmail, 'Confirma tu cuenta'],
    ['reset', resetEmail, 'Restablece tu contraseña'],
    ['cambio de correo', changeEmailEmail, 'Confirma tu nuevo correo'],
  ] as const)('la plantilla de %s incluye el enlace y un asunto claro', (_n, tpl, subjectPart) => {
    const { subject, html } = tpl(URL);
    expect(subject).toContain(subjectPart);
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain('QUINIELA DEL BIENESTAR');
  });
});
