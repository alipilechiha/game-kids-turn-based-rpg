import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DialogueView } from 'waypoint-rpg-narrative';
import { DialogueDialog } from './DialogueDialog.js';
import type { DemoNarrativeAction } from './runtime.js';

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

function installDialogMethods() {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: showModal,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });
  return { showModal, close };
}

function restoreDialogMethods() {
  if (originalShowModal)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: originalShowModal,
    });
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  if (originalClose)
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: originalClose,
    });
  else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
}

const forbiddenView: DialogueView = {
  dialogueId: 'private-dialogue',
  nodeId: 'private-question',
  speakerId: 'guardian',
  text: 'آیا آماده‌ای؟',
  terminal: false,
  exitAllowed: false,
  choices: [{ id: 'yes', label: 'بله', available: true }],
};

describe('narrative modal lifecycle', () => {
  afterEach(() => {
    restoreDialogMethods();
    vi.restoreAllMocks();
  });

  it('keeps a forbidden dialogue open on native cancel and removes its listener on unmount', async () => {
    const methods = installDialogMethods();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onCommand = vi.fn<(action: DemoNarrativeAction) => void>();
    const openerRef = createRef<HTMLButtonElement>();
    const fallbackFocusRef = createRef<HTMLElement>();
    const props = {
      view: forbiddenView,
      speakerName: 'نگهبان',
      choicesLabel: 'پاسخ‌ها',
      continueLabel: 'ادامه',
      finishLabel: 'پایان',
      leaveLabel: 'فعلاً می‌روم',
      onCommand,
      openerRef,
      fallbackFocusRef,
    };

    await act(async () => root.render(createElement(DialogueDialog, props)));
    await act(async () => root.render(createElement(DialogueDialog, props)));

    const dialog = container.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    expect(methods.showModal).toHaveBeenCalledTimes(1);
    const cancel = new Event('cancel', { cancelable: true });
    dialog?.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog?.open).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();

    await act(async () => root.render(createElement(DialogueDialog, { ...props, view: null })));
    await act(async () => root.render(createElement(DialogueDialog, { ...props, view: null })));
    expect(dialog?.open).toBe(false);
    expect(methods.close).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    const afterUnmount = new Event('cancel', { cancelable: true });
    dialog?.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
    expect(onCommand).not.toHaveBeenCalled();
    expect(methods.close).toHaveBeenCalledTimes(1);
    container.remove();
  });
});
