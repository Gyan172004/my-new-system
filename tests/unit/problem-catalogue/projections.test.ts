import { expect, it } from 'vitest';
import {
  projectDetail,
  projectSummary,
} from '../../../src/modules/problem-catalogue/application/projections';
import {
  decodeCursor,
  encodeCursor,
  parseListInput,
} from '../../../src/modules/problem-catalogue/application/read';
import { createApprovedPack } from '../../fixtures/problem-catalogue';
const pack = createApprovedPack();
it('constructs deeply frozen candidate DTOs without private or unknown fields', () => {
  const row = {
    problemId: pack.problemId,
    version: pack.version,
    candidate: { ...pack.candidate, privateCanary: 'CANARY_PRIVATE' },
    interview: 'CANARY_PRIVATE',
  };
  expect(projectSummary(row)).toEqual({
    problemId: pack.problemId,
    title: pack.candidate.title,
    difficulty: pack.candidate.difficulty,
    topicTags: pack.candidate.topicTags,
    latestPublishedVersion: pack.version,
  });
  const detail = projectDetail(row);
  expect(Object.keys(detail).sort()).toEqual(
    [
      'problemId',
      'title',
      'difficulty',
      'topicTags',
      'latestPublishedVersion',
      'statement',
      'constraints',
      'examples',
      'problemPackVersion',
    ].sort(),
  );
  expect(JSON.stringify(detail)).not.toContain('CANARY_PRIVATE');
  expect(Object.isFrozen(detail.examples[0])).toBe(true);
  expect(Object.isFrozen(detail.topicTags)).toBe(true);
  expect(detail.problemPackVersion).toBe(pack.version);
});
it('fails safely on corrupt stored candidate content', () => {
  expect(() =>
    projectDetail({
      problemId: 'p',
      version: 'v',
      candidate: { title: 'bad' },
    }),
  ).toThrow('catalogue_unavailable');
});
it('round trips a strict versioned opaque cursor and enforces bounded inputs', () => {
  expect(decodeCursor(encodeCursor('problem-α'))).toBe('problem-α');
  expect(parseListInput({})).toEqual({ limit: 20, after: null });
  expect(parseListInput({ limit: '100', cursor: encodeCursor('p') })).toEqual({
    limit: 100,
    after: 'p',
  });
  for (const limit of ['0', '101', '1.0', '1e1', '+1', ' 1', '01', ''])
    expect(() => parseListInput({ limit })).toThrow('bad_request');
  for (const cursor of [
    '',
    '!',
    'a'.repeat(1025),
    Buffer.from(
      JSON.stringify({ formatVersion: 2, lastProblemId: 'p' }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ formatVersion: 1, lastProblemId: 'p', private: 'x' }),
    ).toString('base64url'),
  ])
    expect(() => decodeCursor(cursor)).toThrow('bad_request');
});

it('rejects malformed cursor IDs by Unicode scalar and UTF-8 byte bounds', () => {
  for (const lastProblemId of [
    '\u0000',
    '\n',
    '\ud800',
    'é'.repeat(129),
    ' ',
    '',
  ]) {
    const cursor = Buffer.from(
      JSON.stringify({ formatVersion: 1, lastProblemId }),
    ).toString('base64url');
    expect(() => decodeCursor(cursor)).toThrow('bad_request');
  }
  expect(decodeCursor(encodeCursor('é'.repeat(128)))).toBe('é'.repeat(128));
});
