import test from 'node:test';
import assert from 'node:assert/strict';
import { groupResults, findUnansweredShownQuestion } from '../server/results.js';

function participant(identity, verdicts) {
  return {
    id: identity,
    participant_number: identity,
    answers: verdicts.map((verdict) => ({ is_correct: verdict })),
  };
}

test('only completed and fully reviewed attempts receive a place and score', () => {
  const results = groupResults(
    [
      participant('winner', [true, true, true]),
      participant('pending', [true, null, true]),
      participant('playing-reviewed', [true]),
      participant('playing-pending', [null]),
      participant('zero-score', [false, false, false]),
      participant('tied', [true, true, true]),
    ],
    3,
  );
  assert.deepEqual(
    results.ranked.map((result) => [result.id, result.correct_count]),
    [
      ['winner', 3],
      ['tied', 3],
      ['zero-score', 0],
    ],
  );
  assert.deepEqual(results.pending, [
    { id: 'pending', name: 'pending', checked_count: 2, total_count: 3 },
  ]);
  assert.equal(results.playing.length, 2);
  for (const result of [...results.pending, ...results.playing])
    assert.equal('correct_count' in result, false);
});

test('unstarted and empty quizzes never produce final results', () => {
  assert.equal(groupResults([participant('unstarted', [])], 3).ranked.length, 0);
  assert.equal(groupResults([participant('empty', [])], 0).ranked.length, 0);
  assert.deepEqual(groupResults([], 3), { ranked: [], pending: [], playing: [] });
});

test('resume skips only the earliest unanswered shown question', () => {
  const shown = [
    { question_id: 'third', question: { order_number: 3 } },
    { question_id: 'first', question: { order_number: 1 } },
    { question_id: 'second', question: { order_number: 2 } },
  ];
  assert.equal(findUnansweredShownQuestion(shown, [{ question_id: 'first' }]), 'second');
  assert.equal(findUnansweredShownQuestion(shown, shown), null);
  assert.equal(findUnansweredShownQuestion([], []), null);
});
