import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { command } from './verify-ci';
const pins = {
  gitleaks: {
    version: '8.30.1',
    url: 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz',
    sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  },
  trivy: {
    version: '0.76.0',
    url: 'https://github.com/aquasecurity/trivy/releases/download/v0.76.0/trivy_0.76.0_Linux-64bit.tar.gz',
    sha256: 'e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7',
  },
} as const;
async function install(name: keyof typeof pins) {
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error('scanner_platform_unavailable');
  const pin = pins[name];
  const root = resolve('.local/security-tools');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const archive = join(root, `${name}-${pin.version}.tar.gz`);
  let bytes = await readFile(archive).catch(() => undefined);
  if (!bytes) {
    const response = await fetch(pin.url, {
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error('scanner_download_failed');
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== pin.sha256)
    throw new Error('scanner_integrity_failed');
  await writeFile(archive, bytes, { mode: 0o600 });
  const directory = await mkdtemp(join(root, `${name}-`));
  try {
    if (
      (await command('tar', ['-xzf', archive, '-C', directory, name], {
        quiet: true,
        timeoutMs: 10000,
      })) !== 0
    )
      throw new Error('scanner_install_failed');
    return {
      binary: join(directory, name),
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
async function main() {
  const mode = process.argv[2];
  if (
    process.argv.length !== 3 ||
    !['install', 'secrets', 'image', 'filesystem'].includes(mode!)
  )
    throw new Error('scanner_arguments_invalid');
  for (const name of (mode === 'install'
    ? ['gitleaks', 'trivy']
    : [mode === 'secrets' ? 'gitleaks' : 'trivy']) as (keyof typeof pins)[]) {
    const tool = await install(name);
    try {
      const common = [
        '--quiet',
        '--exit-code',
        '1',
        '--severity',
        'HIGH,CRITICAL',
      ];
      const args =
        mode === 'install'
          ? ['--version']
          : mode === 'secrets'
            ? [
                'dir',
                '--no-banner',
                '--redact=100',
                '--log-level',
                'error',
                '--report-format',
                'json',
                '--report-path',
                join(dirname(tool.binary), 'report.json'),
                '--config',
                '.gitleaks.toml',
                '.',
              ]
            : mode === 'image'
              ? [
                  'image',
                  ...common,
                  '--scanners',
                  'vuln',
                  'my-new-system-foundation:local',
                ]
              : [
                  'filesystem',
                  ...common,
                  '--scanners',
                  'vuln,misconfig',
                  '--skip-dirs',
                  'node_modules,.local,.git,.next,dist,skills,.agents,.specify',
                  '--skip-files',
                  'docs/**,artifacts/**',
                  '.',
                ];
      const code = await command(tool.binary, args, { timeoutMs: 300000 });
      if (mode === 'secrets') {
        const report: unknown = JSON.parse(
          await readFile(join(dirname(tool.binary), 'report.json'), 'utf8'),
        );
        if (!Array.isArray(report)) throw new Error('scanner_report_invalid');
        if (report.length > 0 && code === 1)
          throw new Error('secret_scan_findings');
        if (report.length > 0) throw new Error('scanner_report_invalid');
      }
      if (code !== 0) throw new Error('scanner_check_failed');
    } finally {
      await tool.dispose();
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error && error.message === 'secret_scan_findings'
        ? error.message
        : 'security_scan_failed_or_unavailable',
    );
    process.exitCode = 1;
  });
