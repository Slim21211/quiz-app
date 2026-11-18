export function normalizeAnswer(answer: string): string {
  return answer
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function answerHint(answer: string, expected: string): string | null {
  const normalized = normalizeAnswer(answer);
  const normalizedExpected = normalizeAnswer(expected);
  if (!normalized || !normalizedExpected) return null;
  if (normalized === normalizedExpected)
    return 'Совпадает после нормализации регистра, пробелов, знаков препинания и е/ё.';
  const answerWords = normalized.split(' ').sort().join(' ');
  const expectedWords = normalizedExpected.split(' ').sort().join(' ');
  if (answerWords === expectedWords)
    return 'Те же слова в другом порядке. Проверьте, не изменился ли смысл.';
  return null;
}
