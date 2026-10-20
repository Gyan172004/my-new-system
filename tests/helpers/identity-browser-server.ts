import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createProcessProject } from './process';
const project = await createProcessProject();
let disposing = false;
async function stop() {
  if (disposing) return;
  disposing = true;
  await project.dispose();
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
try {
  const route = join(project.root, 'src/app/identity-fixture');
  await mkdir(route, { recursive: true });
  await writeFile(
    join(route, 'page.tsx'),
    `
'use client';
import {useState} from 'react';
import {AccountStateBoundary,useAccountSignal} from '../../modules/identity-ui/public';
function Private({owner,onCancel}) {
 const signal=useAccountSignal(); const [data,setData]=useState('empty');
 const load=()=> {const cancel=()=>{clearTimeout(timer);onCancel()}; const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);if(!signal.aborted)setData('private:'+owner)},500); signal.addEventListener('abort',cancel,{once:true});};
 return <><p data-testid="owner">{owner}</p><p data-testid="private">{data}</p><button onClick={load}>Load private response</button></>;
}
export default function Fixture(){const [owner,setOwner]=useState('alice'); const [cancelled,setCancelled]=useState(0);return <><button onClick={()=>setOwner('bob')}>Switch account</button><button onClick={()=>setOwner('signed-out')}>Sign out</button><p data-testid="cancelled">{cancelled}</p><AccountStateBoundary accountKey={owner}><Private owner={owner} onCancel={()=>setCancelled(n=>n+1)}/></AccountStateBoundary></>}
`,
  );
  const child = project.run(['--import', 'tsx', 'src/server/bootstrap.ts'], {
    NODE_ENV: 'development',
    APP_ENV: 'test',
    DATABASE_URL: 'postgresql://127.0.0.1:1/unreachable',
    IDENTITY_ADAPTER: 'disabled',
    PORT: '3102',
    NEXT_TELEMETRY_DISABLED: '1',
  });
  if ((await child.done) !== 0 && !disposing)
    throw new Error('identity_browser_server_failed');
} finally {
  await stop();
}
