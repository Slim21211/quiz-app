const russianPlurals = new Intl.PluralRules('ru');

export function questionCountLabel(count: number): string {
  const category = russianPlurals.select(count);
  const noun = category === 'one' ? 'вопрос' : category === 'few' ? 'вопроса' : 'вопросов';
  return `${count} ${noun}`;
}
