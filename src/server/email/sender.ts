import { env } from '@/server/env';

// Puerto de salida de correos. En producción Resend; sin API key (dev),
// el correo se imprime en consola con sus enlaces para no bloquear el flujo.
export interface EmailSender {
  send(to: string | string[], subject: string, html: string): Promise<void>;
}

class ConsoleSender implements EmailSender {
  async send(to: string | string[], subject: string, html: string): Promise<void> {
    const dest = Array.isArray(to) ? to.join(', ') : to;
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    console.log(
      `\n✉️  [correo en consola — configura RESEND_API_KEY para envíos reales]` +
        `\n   Para:    ${dest}` +
        `\n   Asunto:  ${subject}` +
        `\n   Enlaces: ${links.join('  ') || '(ninguno)'}\n`,
    );
  }
}

class ResendSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(to: string | string[], subject: string, html: string): Promise<void> {
    const { Resend } = await import('resend');
    const resend = new Resend(this.apiKey);
    const { error } = await resend.emails.send({ from: this.from, to, subject, html });
    if (error) throw new Error(`Resend: ${error.message}`);
  }
}

export function getEmailSender(): EmailSender {
  const key = env.resendApiKey;
  return key ? new ResendSender(key, env.emailFrom) : new ConsoleSender();
}
