/**
This file is part of Scan.

Scan is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
Scan is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Scan.  If not, see <https://www.gnu.org/licenses/>.
*/

export function getDocumentElementById<T extends Element>(
  document: Document,
  id: string,
  constructor: { new (): T }
): T {
  const element: Element | null = document.getElementById(id);

  if (!element || !(element instanceof constructor)) {
    throw new Error(`Could not find element with id ${id}`);
  }

  return <T>element;
}

export function getOptionalDocumentElementById<T extends Element>(
  document: Document,
  id: string,
  constructor: { new (): T }
): T | undefined {
  const element: Element | null = document.getElementById(id);

  if (!element) {
    return undefined;
  }

  if (!(element instanceof constructor)) {
    throw new Error(`Could not find element with id ${id}`);
  }

  return <T>element;
}

export function getDocumentElementsByClassName<T extends Element>(
  document: Document,
  id: string,
  constructor: { new (): T }
): HTMLCollectionOf<T> {
  const collection: HTMLCollectionOf<Element> = document.getElementsByClassName(
    id
  );

  // This is harmless since there isn't anything to iterate over.
  if (collection.length === 0) {
    return <HTMLCollectionOf<T>>collection;
  }

  if (!(collection.item(0) instanceof constructor)) {
    throw new Error(`Could not find elements with class name id ${id}`);
  }

  return <HTMLCollectionOf<T>>collection;
}

export function getElementChildren<T extends Element>(
  element: Element,
  constructor: { new (): T }
): HTMLCollectionOf<T> {
  const children: HTMLCollectionOf<Element> = element.children;

  // This is harmless since there isn't anything to iterate over.
  if (children.length === 0) {
    return <HTMLCollectionOf<T>>children;
  }

  if (!(children.item(0) instanceof constructor)) {
    throw new Error(`Child elements are not the correct type.`);
  }

  return <HTMLCollectionOf<T>>children;
}

export function removeElementChildren(
  element: Element | undefined | null
): void {
  if (!element) {
    return;
  }

  element.innerHTML = "";
}

export function getElementFromEvent<T extends HTMLElement, TE extends Event>(
  event: TE,
  constructor: { new (): T }
): T {
  if (!(event.target instanceof constructor)) {
    throw new Error(`Event element type is incorrect`);
  }

  return event.target;
}
