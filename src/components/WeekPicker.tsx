"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

interface WeekPickerProps {
  current: string;
  previous: string | null;
  next: string | null;
  options: { id: string; label: string }[];
}

const hrefFor = (week: string) => `/?week=${encodeURIComponent(week)}`;

/** Previous and next links plus a dropdown. The selected week lives in the URL. */
export function WeekPicker({ current, previous, next, options }: WeekPickerProps) {
  const router = useRouter();
  return (
    <nav className="picker" aria-label="Week picker">
      {previous ? (
        <Link className="picker-step" href={hrefFor(previous)} aria-label="Previous week">
          &larr;
        </Link>
      ) : (
        <span className="picker-step picker-step-disabled" aria-hidden="true">
          &larr;
        </span>
      )}
      <label className="picker-select">
        <span className="visually-hidden">Week</span>
        <select value={current} onChange={(event) => router.push(hrefFor(event.target.value))}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {next ? (
        <Link className="picker-step" href={hrefFor(next)} aria-label="Next week">
          &rarr;
        </Link>
      ) : (
        <span className="picker-step picker-step-disabled" aria-hidden="true">
          &rarr;
        </span>
      )}
    </nav>
  );
}
