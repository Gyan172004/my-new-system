import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isBuiltin } from 'node:module';
import ts from 'typescript';

type Violation = { rule: string; file: string };
const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dangerousBuiltin = /^(?:node:)?(?:child_process|vm|worker_threads)$/;
const serverPackage =
  /^(?:node:|pg(?:\/|$)|openai(?:\/|$)|e2b(?:\/|$)|@aws-sdk\/|@clerk\/(?:backend(?:\/|$)|nextjs\/server(?:\/|$)))/;
const providerPackage = /^(?:openai|e2b|@aws-sdk\/[^/]+|@clerk\/[^/]+)(?:\/|$)/;

async function scanFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await scanFiles(path)));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

export async function checkBoundaries(directory: string = '.') {
  const projectRoot = resolve(directory);
  const violations: Violation[] = [];
  const normalize = (path: string) =>
    relative(projectRoot, path).replaceAll('\\', '/');
  const report = (rule: string, file: string) => {
    if (!violations.some((item) => item.rule === rule && item.file === file))
      violations.push({ rule, file });
  };
  try {
    const configPath = resolve(projectRoot, 'tsconfig.json');
    const readConfig = ts.readConfigFile(configPath, ts.sys.readFile);
    if (readConfig.error) throw new Error('architecture_config_invalid');
    const parsed = ts.parseJsonConfigFileContent(
      readConfig.config,
      ts.sys,
      projectRoot,
    );
    const files = await scanFiles(resolve(projectRoot, 'src'));
    const graph = new Map<string, string[]>();
    const clients: string[] = [];
    const deniedClientFiles = new Set<string>();
    for (const file of files) {
      const name = normalize(file);
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const domain = /^src\/(?:app\/api\/|modules\/)/.test(name);
      const client = source.statements.some(
        (statement) =>
          ts.isExpressionStatement(statement) &&
          ts.isStringLiteral(statement.expression) &&
          statement.expression.text === 'use client',
      );
      if (client) clients.push(file);
      const edges: string[] = [];
      const dependency = (specifier: string) => {
        if (domain && dangerousBuiltin.test(specifier))
          report('no-candidate-execution', name);
        if (name.startsWith('src/') && providerPackage.test(specifier)) {
          const owner = specifier.startsWith('openai')
            ? 'model-gateway'
            : specifier.startsWith('@clerk/')
              ? 'identity-profile'
              : specifier.startsWith('e2b')
                ? 'execution-coordination'
                : undefined;
          const browserAdapter =
            specifier === '@clerk/nextjs' &&
            name.startsWith('src/modules/identity-ui/adapters/');
          const browserProxy =
            specifier === '@clerk/nextjs/server' &&
            name.startsWith('src/modules/identity-browser/adapters/');
          const permitted =
            browserAdapter ||
            browserProxy ||
            (owner
              ? name.startsWith(`src/modules/${owner}/adapters/`)
              : /^src\/modules\/[^/]+\/adapters\//.test(name));
          if (!permitted) report('provider-adapter-only', name);
        }
        if (isBuiltin(specifier) || serverPackage.test(specifier))
          deniedClientFiles.add(file);
        const resolved = ts.resolveModuleName(
          specifier,
          file,
          parsed.options,
          ts.sys,
        ).resolvedModule?.resolvedFileName;
        if (resolved && normalize(resolved).startsWith('src/'))
          edges.push(resolve(resolved));
      };
      const modelAdapter = name.startsWith(
        'src/modules/model-gateway/adapters/',
      );
      const isFetch = (node: ts.Node) =>
        (ts.isIdentifier(node) && node.text === 'fetch') ||
        ((ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
          ts.isIdentifier(node.expression) &&
          ['globalThis', 'window', 'self'].includes(node.expression.text) &&
          (ts.isPropertyAccessExpression(node)
            ? node.name.text === 'fetch'
            : node.argumentExpression &&
              ts.isStringLiteralLike(node.argumentExpression) &&
              node.argumentExpression.text === 'fetch'));
      const internalCall = (node: ts.Node) =>
        ts.isCallExpression(node) &&
        isFetch(node.expression) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        /^\/api(?:\/|$)/.test(node.arguments[0].text);
      const visit = (node: ts.Node) => {
        if (!modelAdapter) {
          if (
            ts.isStringLiteralLike(node) &&
            /(?:^|[/.])api\.(?:openai|groq)\.com(?:[/:]|$)/i.test(node.text)
          )
            report('provider-adapter-only', name);
          if (isFetch(node)) {
            // A literal same-origin browser API call is permitted; aliases/dynamic targets are not.
            const expression =
              ts.isIdentifier(node) &&
              (ts.isPropertyAccessExpression(node.parent) ||
                ts.isElementAccessExpression(node.parent))
                ? node.parent
                : node;
            if (!internalCall(expression.parent))
              report('provider-adapter-only', name);
          }
        }
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteralLike(node.moduleSpecifier)
        )
          dependency(node.moduleSpecifier.text);
        if (
          ts.isImportEqualsDeclaration(node) &&
          ts.isExternalModuleReference(node.moduleReference) &&
          node.moduleReference.expression &&
          ts.isStringLiteralLike(node.moduleReference.expression)
        )
          dependency(node.moduleReference.expression.text);
        if (ts.isCallExpression(node)) {
          const argument = node.arguments[0];
          const moduleCall =
            node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === 'require');
          if (moduleCall && argument && ts.isStringLiteralLike(argument))
            dependency(argument.text);
          else if (moduleCall) {
            if (domain) report('no-candidate-execution', name);
            deniedClientFiles.add(file);
          }
        }
        if (
          domain &&
          ts.isIdentifier(node) &&
          ['eval', 'Function', 'getBuiltinModule'].includes(node.text)
        )
          report('no-candidate-execution', name);
        if (
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)
        ) {
          const key = ts.isPropertyAccessExpression(node)
            ? node.name.text
            : node.argumentExpression &&
                ts.isStringLiteralLike(node.argumentExpression)
              ? node.argumentExpression.text
              : undefined;
          if (
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'process' &&
            key === 'env'
          ) {
            const parent = node.parent;
            const parentKey = ts.isPropertyAccessExpression(parent)
              ? parent.name.text
              : ts.isElementAccessExpression(parent) &&
                  parent.argumentExpression &&
                  ts.isStringLiteralLike(parent.argumentExpression)
                ? parent.argumentExpression.text
                : undefined;
            const exposedSecrets = [
              'NEXT_PUBLIC_DATABASE_URL',
              'NEXT_PUBLIC_OPENAI_API_KEY',
              'NEXT_PUBLIC_GROQ_API_KEY',
              'NEXT_PUBLIC_CLERK_SECRET_KEY',
            ];
            if (
              parentKey !== 'NODE_ENV' &&
              (!parentKey?.startsWith('NEXT_PUBLIC_') ||
                exposedSecrets.includes(parentKey))
            )
              deniedClientFiles.add(file);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      graph.set(file, edges);
    }
    for (const client of clients) {
      const seen = new Set<string>();
      const pending = [client];
      while (pending.length) {
        const file = pending.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const name = normalize(file);
        if (
          /^src\/server\//.test(name) ||
          (/^src\/modules\/[^/]+\/(?!public\.ts$)/.test(name) &&
            !/^src\/modules\/identity-ui\/(?:adapters|application)\//.test(
              name,
            )) ||
          deniedClientFiles.has(file)
        )
          report('client-server-boundary', normalize(client));
        pending.push(...(graph.get(file) ?? []));
      }
    }
    const result = spawnSync(
      process.execPath,
      [
        resolve(
          toolRoot,
          'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs',
        ),
        '--config',
        resolve(toolRoot, '.dependency-cruiser.cjs'),
        '--output-type',
        'json',
        'src',
      ],
      { cwd: projectRoot, encoding: 'utf8', timeout: 15000 },
    );
    if (result.error || result.signal || ![0, 1].includes(result.status ?? -1))
      throw new Error('architecture_dependency_analysis_failed');
    const graphResult = JSON.parse(result.stdout) as {
      summary: { violations: Array<{ from: string; rule: { name: string } }> };
    };
    for (const violation of graphResult.summary.violations)
      report(violation.rule.name, violation.from);
    return { violations, exitCode: violations.length ? 1 : 0 };
  } catch {
    return {
      violations: [{ rule: 'architecture-analysis-unavailable', file: 'src' }],
      exitCode: 2,
    };
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = await checkBoundaries(process.argv[2]);
  process.stdout.write(JSON.stringify(result.violations) + '\n');
  process.exitCode = result.exitCode;
}
