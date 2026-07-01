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

  it('muestra asignaciones y anomalías juntas', () => {
    const { subject, html } = knockoutAssignedEmail(
      [{ stage: 'QF', homeCode: 'ARG', awayCode: 'BRA' }],
      ['R16: código desconocido "ZZZ".'],
      'https://quiniela.example',
    );
    expect(subject).toContain('1');
    expect(html).toContain('ARG');
    expect(html).toContain('BRA');
    expect(html).toContain('Cuartos');
    expect(html).toContain('ZZZ');
  });

  it('usa el código de fase crudo cuando no hay etiqueta conocida', () => {
    const { html } = knockoutAssignedEmail(
      [{ stage: 'UNKNOWN', homeCode: 'ARG', awayCode: 'BRA' }],
      [],
      'https://quiniela.example',
    );
    expect(html).toContain('UNKNOWN');
  });

  it('el correo lista avances de topología y anomalías', () => {
    const { subject, html } = knockoutAssignedEmail(
      [], // assigned R32
      ['m90 lado H: topología dice CAN pero ya hay BRA con picks — revisa Admin.'],
      'https://app.example',
      [{ matchId: 90, slot: 'H', teamCode: 'CAN' }], // advanced (nuevo parámetro)
    );
    expect(html).toContain('CAN');
    expect(html).toContain('revisa Admin');
    expect(subject).toBeTruthy();
  });

  it('no renderiza la sección de avances cuando no hay avances', () => {
    const { html } = knockoutAssignedEmail([], [], 'https://quiniela.example', []);
    expect(html).not.toContain('actualizados por avance');
  });

  it('renderiza la sección de avances con el matchId y el lado', () => {
    const { html } = knockoutAssignedEmail(
      [],
      [],
      'https://quiniela.example',
      [{ matchId: 90, slot: 'H', teamCode: 'CAN' }],
    );
    expect(html).toContain('actualizados por avance');
    expect(html).toContain('90');
    expect(html).toContain('CAN');
  });
});
