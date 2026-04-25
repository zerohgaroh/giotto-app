export function normalizeStaffLogin(input: string) {
  return input.trim().toLowerCase();
}

export function resolveStaffLoginCandidates(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const normalized = normalizeStaffLogin(trimmed);
  if (normalized === trimmed) {
    return [trimmed];
  }

  return [trimmed, normalized];
}

export function normalizeManagerPassword(input: string) {
  return input.trim();
}
