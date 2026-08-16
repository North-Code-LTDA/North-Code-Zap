import type { ScheduledTarget } from '../types';

export interface TemplateOptions {
  seed?: string;
}

// Simple string hash function for deterministic randomness
function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Central template rendering function for message personalization ({nome}) and Spintax ({opt1|opt2})
 */
export function renderMessageTemplate(
  template: string,
  target: ScheduledTarget | { jid: string; label?: string; name?: string },
  fallbackName = 'amigo(a)',
  options: TemplateOptions = {}
): string {
  if (!template) return '';

  // Determine the best name to use for {nome}
  let resolvedName = '';
  if (target.name && typeof target.name === 'string' && target.name.trim()) {
    resolvedName = target.name.trim();
  } else if (target.label && typeof target.label === 'string' && target.label.trim()) {
    const trimmed = target.label.trim();
    // Only use label if it's not a pure raw telephone number (e.g. +5593... or 5593...)
    if (!/^\+?\d+$/.test(trimmed.replace(/[\s\-()]/g, ''))) {
      resolvedName = trimmed;
    }
  }

  // Fallback if no real name was found
  if (!resolvedName) {
    resolvedName = (fallbackName && fallbackName.trim()) || 'amigo(a)';
  }

  // Case-insensitive global replace of {nome}
  let result = template.replace(/\{nome\}/gi, resolvedName);

  // Spintax processing: matches {opt1|opt2|opt3}
  let blockIndex = 0;
  result = result.replace(/\{([^{}]+)\}/g, (match, content) => {
    if (!content.includes('|')) {
      return match;
    }

    const choices = content.split('|').map((c: string) => c.trim());
    if (choices.length === 0) return match;

    const seedString = `${options.seed || 'default_seed'}_${target.jid}_${blockIndex}`;
    const hash = stringHash(seedString);
    const selectedChoice = choices[hash % choices.length];
    
    blockIndex++;
    return selectedChoice;
  });

  return result;
}
