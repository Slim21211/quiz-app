export function summarizeAnswers(answers, totalCount) {
  const answeredCount = answers.length;
  const pendingCount = answers.filter((answer) => answer.is_correct === null).length;
  return {
    correct_count: answers.filter((answer) => answer.is_correct === true).length,
    answered_count: answeredCount,
    pending_count: pendingCount,
    total_count: totalCount,
    completed: totalCount > 0 && answeredCount >= totalCount,
  };
}

export function groupResults(participants, totalCount) {
  const ranked = [];
  const pending = [];
  const playing = [];
  for (const participant of participants) {
    const identity = { id: participant.id, name: participant.participant_number || 'Участник' };
    const { completed, ...summary } = summarizeAnswers(participant.answers, totalCount);
    if (!completed) {
      playing.push({
        ...identity,
        answered_count: summary.answered_count,
        total_count: totalCount,
      });
    } else if (summary.pending_count > 0) {
      pending.push({
        ...identity,
        checked_count: summary.answered_count - summary.pending_count,
        total_count: totalCount,
      });
    } else {
      ranked.push({ ...identity, ...summary });
    }
  }
  ranked.sort((left, right) => right.correct_count - left.correct_count);
  return { ranked, pending, playing };
}
