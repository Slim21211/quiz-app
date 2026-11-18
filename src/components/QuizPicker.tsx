import type { KeyboardEvent } from 'react';
import type { Quiz } from '@/types';
import { useId, useRef, useState, useEffect } from 'react';
import styles from '@/App.module.scss';

interface QuizPickerProps {
  quizzes: Quiz[];
  selected: string;
  onChange: (quizId: string) => void;
}

export function QuizPicker({ quizzes, selected, onChange }: QuizPickerProps) {
  const inputId = useId();
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedQuiz = quizzes.find((quiz) => quiz.id === selected);
  const options = quizzes.filter((quiz) =>
    quiz.name.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')),
  );
  const activeOption = options[activeIndex];

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    }
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (open && activeOption)
      document.getElementById(`${listId}-${activeOption.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeOption, listId]);

  function openList(): void {
    setSearch('');
    setActiveIndex(
      Math.max(
        0,
        quizzes.findIndex((quiz) => quiz.id === selected),
      ),
    );
    setOpen(true);
  }
  function choose(quizId: string): void {
    onChange(quizId);
    setOpen(false);
    setSearch('');
  }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((previous) =>
        options.length ? (previous + direction + options.length) % options.length : 0,
      );
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (activeOption) choose(activeOption.id);
    } else if (event.key === 'Tab') setOpen(false);
  }
  return (
    <div className={`${styles.field} ${styles.picker}`} ref={container}>
      <label htmlFor={inputId}>Квиз</label>
      <div className={styles.pickerControl}>
        <input
          ref={input}
          id={inputId}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeOption ? `${listId}-${activeOption.id}` : undefined}
          disabled={!quizzes.length}
          placeholder={quizzes.length ? 'Найти квиз' : 'Нет доступных квизов'}
          value={
            open
              ? search
              : `${selectedQuiz?.name || ''}${selectedQuiz && !selectedQuiz.is_active ? ' (черновик)' : ''}`
          }
          onClick={() => {
            if (!open) openList();
          }}
          onFocus={openList}
          onChange={(event) => {
            setSearch(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            if (!container.current?.contains(event.relatedTarget)) setOpen(false);
          }}
        />
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {open && (
        <div className={styles.pickerMenu}>
          <ul id={listId} role="listbox" aria-label="Квизы">
            {options.map((quiz, index) => (
              <li
                key={quiz.id}
                id={`${listId}-${quiz.id}`}
                role="option"
                aria-selected={quiz.id === selected}
                data-active={index === activeIndex}
                onPointerMove={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(quiz.id)}
              >
                <span>{quiz.name}</span>
                {!quiz.is_active && <small>Черновик</small>}
                {quiz.id === selected && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
          {!options.length && <p className={styles.pickerEmpty}>Квизы не найдены</p>}
        </div>
      )}
    </div>
  );
}
