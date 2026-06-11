import { describe, it, expect } from 'vitest';
import {
  PlayerError,
  deletePlayer,
  setPlayerAdmin,
  type PlayerInfo,
  type PlayersRepo,
} from './players';

const SUPER = 'gilberto.aspros@gmail.com';
const esSuper = (email: string) => email === SUPER;

function fakeRepo(players: PlayerInfo[]) {
  const map = new Map(players.map((p) => [p.id, { ...p }]));
  const repo: PlayersRepo = {
    async getPlayer(id) {
      return map.get(id) ?? null;
    },
    async deletePlayer(id) {
      map.delete(id);
    },
    async setAdmin(id, isAdmin) {
      map.get(id)!.isAdmin = isAdmin;
    },
  };
  return { repo, map };
}

const yo: PlayerInfo = { id: 'yo', email: SUPER, isAdmin: false, confirmed: true };
const amigo: PlayerInfo = { id: 'amigo', email: 'amigo@demo.mx', isAdmin: false, confirmed: true };
const otroSuper: PlayerInfo = { id: 'super2', email: SUPER, isAdmin: false, confirmed: true };

describe('borrar participantes', () => {
  it('borra a un jugador normal con todo y sus picks (cascade)', async () => {
    const { repo, map } = fakeRepo([yo, amigo]);
    await deletePlayer(repo, 'yo', 'amigo', esSuper);
    expect(map.has('amigo')).toBe(false);
  });

  it('nadie puede borrarse a sí mismo', async () => {
    const { repo } = fakeRepo([yo]);
    await expect(deletePlayer(repo, 'yo', 'yo', esSuper)).rejects.toThrow(PlayerError);
  });

  it('los super-admins de ADMIN_EMAILS no se pueden borrar', async () => {
    const { repo } = fakeRepo([{ ...amigo, id: 'admin-ui', isAdmin: true }, otroSuper]);
    await expect(deletePlayer(repo, 'admin-ui', 'super2', esSuper)).rejects.toThrow(/super/i);
  });

  it('rechaza objetivos inexistentes', async () => {
    const { repo } = fakeRepo([yo]);
    await expect(deletePlayer(repo, 'yo', 'fantasma', esSuper)).rejects.toThrow(PlayerError);
  });
});

describe('nombrar y quitar admins', () => {
  it('nombra admin a un jugador registrado y lo puede quitar', async () => {
    const { repo, map } = fakeRepo([yo, amigo]);
    await setPlayerAdmin(repo, 'yo', 'amigo', true, esSuper);
    expect(map.get('amigo')!.isAdmin).toBe(true);
    await setPlayerAdmin(repo, 'yo', 'amigo', false, esSuper);
    expect(map.get('amigo')!.isAdmin).toBe(false);
  });

  it('nadie puede cambiarse el rol a sí mismo', async () => {
    const { repo } = fakeRepo([yo]);
    await expect(setPlayerAdmin(repo, 'yo', 'yo', true, esSuper)).rejects.toThrow(PlayerError);
  });

  it('a un super-admin no se le puede tocar el rol desde la UI', async () => {
    const { repo } = fakeRepo([yo, otroSuper]);
    await expect(setPlayerAdmin(repo, 'yo', 'super2', false, esSuper)).rejects.toThrow(/super/i);
  });
});
