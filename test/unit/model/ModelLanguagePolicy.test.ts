import { describe, expect, it } from 'vitest';
import { ModelLanguagePolicy } from '@engine/Language/ModelLanguagePolicy.js';

describe('ModelLanguagePolicy', () => {
  const policy = new ModelLanguagePolicy({ project: 'ru', nodus: 'en', response: 'de' });

  it('routes internal Nodus output to language.nodus', () => {
    expect(policy.nodus()).toContain('Use en');
    expect(policy.nodus()).toContain('machine-facing Nodus fields');
  });

  it('routes human-authored project text to language.project', () => {
    expect(policy.project()).toContain('Use ru');
    expect(policy.project()).toContain('documentation and comments');
  });

  it('reserves language.response for direct user text', () => {
    expect(policy.response()).toContain('Use de');
    expect(policy.response()).toContain('direct consumer is the user');
  });

  it('does not inject response language into a mixed project edit contract', () => {
    const guidance = policy.mixedProjectEdit().join('\n');
    expect(guidance).toContain('Use en');
    expect(guidance).toContain('Use ru');
    expect(guidance).not.toContain('Use de');
  });
});
