const AUTHORITATIVE_PATTERNS: RegExp[] = [
  /\.gov$/i,
  /\.edu$/i,
  /\.ac\.[a-z]{2}$/i, // e.g. ac.uk, ac.in
  /wikipedia\.org$/i,
  /britannica\.com$/i,
  /nist\.gov$/i,
  /who\.int$/i,
  /nasa\.gov$/i,
  /khanacademy\.org$/i,
  /nature\.com$/i,
  /sciencedirect\.com$/i,
  /ncbi\.nlm\.nih\.gov$/i,
];

/**
 * Results from these domains carry more weight when ranking answers, since the pipeline has
 * no language model to judge source quality for itself.
 */
export function isAuthoritativeDomain(hostname: string): boolean {
  return AUTHORITATIVE_PATTERNS.some((re) => re.test(hostname));
}
