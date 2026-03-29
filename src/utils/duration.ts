const UNITS: Record<string, number> = {
	ms: 1,
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
};

const DURATION_RE = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/;

export const parseDuration = (input: string): number => {
	const match = input.trim().match(DURATION_RE);
	if (!match) throw new Error(`Invalid duration: "${input}". Expected format: "3s", "10m", "2h"`);
	const value = Number.parseFloat(match[1] ?? '0');
	const unit = UNITS[match[2] ?? 'ms'] ?? 1;
	return Math.round(value * unit);
};
