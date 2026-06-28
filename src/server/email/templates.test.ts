import { describe, it, expect } from 'vitest';
import { confirmEmail, resetEmail, changeEmailEmail, knockoutAssignedEmail } from './templates';

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

describe('correo de auto-asignación de eliminatoria', () => {
  it('lista cruces y enlaza a la app cuando hay asignaciones', () => {
    const { subject, html } = knockoutAssignedEmail(
      [{ stage: 'R16', homeCode: 'MEX', awayCode: 'ECU' }],
      [],
      'https://quiniela.example',
    );
    expect(subject).toContain('1');
    expect(html).toContain('MEX');
    expect(html).toContain('ECU');
    expect(html).toContain('Octavos');
    expect(html).toContain('href="https://quiniela.example/partidos"');
    expect(html).toContain('QUINIELA DEL BIENESTAR');
  });

  it('incluye las anomalías cuando las hay', () => {
    const { subject, html } = knockoutAssignedEmail([], ['R16: código desconocido "ZZZ".'], 'https://quiniela.example');
    expect(subject.toLowerCase()).toContain('revisa');
    expect(html).toContain('ZZZ');
  });
});
