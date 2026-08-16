import type { ScheduledTarget } from '../types';

/**
 * Central template rendering function for message personalization ({nome})
 */
export function renderMessageTemplate(
  template: string,
  target: ScheduledTarget | { jid: string; label?: string; name?: string },
  fallbackName = 'amigo(a)'
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
  return template.replace(/\{nome\}/gi, resolvedName);
}
