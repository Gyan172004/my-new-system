import { expect, it } from 'vitest';
import { createActiveUserLookup } from '../../../src/modules/identity-profile/public';
it('invalid author claims fail closed before any database work', async () => {
  const db = {
    async withClient<T>(): Promise<T> {
      throw Error('database should not receive malformed UUID');
    },
  };
  const lookup = createActiveUserLookup(db);
  for (const id of [
    '',
    'claimed',
    'x'.repeat(100000),
    '11111111-1111-4111-8111-111111111111\n',
  ])
    expect(await lookup(id)).toBeNull();
});
