import { fetchAutocompleteSuggestions } from '@/lib/search';

export interface FetchAutocompleteOptions {
  depth?: number;
  branchFactor?: number;
  signal?: AbortSignal;
}

export async function fetchAutocomplete(
  query: string,
  depth = 1,
  options: FetchAutocompleteOptions = {},
): Promise<string[]> {
  const maxDepth = Math.max(1, depth);
  const branchFactor = Math.max(1, options.branchFactor ?? 5);
  const visited = new Set<string>();
  const queue: Array<{ term: string; depth: number }> = [{ term: query, depth: 0 }];
  const collected = new Set<string>();

  while (queue.length > 0) {
    if (options.signal?.aborted) {
      break;
    }
    const current = queue.shift();
    if (!current) {
      break;
    }
    if (current.depth >= maxDepth) {
      continue;
    }

    const { term } = current;
    if (visited.has(term)) {
      continue;
    }
    visited.add(term);

    const { suggestions } = await fetchAutocompleteSuggestions(term);
    for (const suggestion of suggestions) {
      if (!collected.has(suggestion)) {
        collected.add(suggestion);
      }
    }

    const nextDepth = current.depth + 1;
    if (nextDepth >= maxDepth) {
      continue;
    }

    const nextSeeds = suggestions.slice(0, branchFactor);
    for (const seed of nextSeeds) {
      if (!visited.has(seed)) {
        queue.push({ term: seed, depth: nextDepth });
      }
    }
  }

  return Array.from(collected);
}
