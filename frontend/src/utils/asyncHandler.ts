/** Run async/sync handlers from JSX without the void operator (Sonar S7757). */
export function runHandler(fn: () => void | Promise<void>): void {
  Promise.resolve(fn()).catch(() => {});
}

export function handler(fn: () => void | Promise<void>): () => void {
  return () => runHandler(fn);
}

export function handlerArg<T>(fn: (arg: T) => void | Promise<void>): (arg: T) => void {
  return (arg: T) => runHandler(() => fn(arg));
}

export function handlerEvent<E>(
  fn: (event: E) => void | Promise<void>,
): (event: E) => void {
  return (event: E) => runHandler(() => fn(event));
}

import type { SubmitEvent } from 'react';

type FormSubmitHandler = (event: SubmitEvent<HTMLFormElement>) => void | Promise<void>;

export function handlerSubmit(fn: FormSubmitHandler) {
  return (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    runHandler(() => fn(event));
  };
}
