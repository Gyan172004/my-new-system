import { createServer, connect, type Socket } from 'node:net';
export async function databaseProxy(connectionString: string) {
  const target = new URL(connectionString);
  const sockets = new Set<Socket>();
  const server = createServer((incoming) => {
    const outgoing = connect({
      host: target.hostname,
      port: Number(target.port || 5432),
    });
    for (const socket of [incoming, outgoing]) {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      socket.on('error', () => {
        incoming.destroy();
        outgoing.destroy();
      });
    }
    incoming.pipe(outgoing);
    outgoing.pipe(incoming);
  });
  let port = 0;
  const start = () =>
    new Promise<void>((resolve, reject) => {
      const fail = (e: Error) => reject(e);
      server.once('error', fail);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', fail);
        const address = server.address();
        if (!address || typeof address === 'string')
          return reject(new Error('proxy_address_failed'));
        port = address.port;
        resolve();
      });
    });
  const stop = () =>
    new Promise<void>((resolve, reject) => {
      for (const socket of sockets) socket.destroy();
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => (error ? reject(error) : resolve()));
    });
  await start();
  const url = new URL(connectionString);
  url.hostname = '127.0.0.1';
  url.port = String(port);
  return { connectionString: url.toString(), start, stop };
}
