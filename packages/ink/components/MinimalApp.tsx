import React, { type ReactNode, PureComponent, type ContextType } from 'react';
import { INITIAL_STATE, type ParsedInput, type ParsedKey, type ParsedMouse, parseMultipleKeypresses } from '../parse-keypress.js';
import { isXtermJs, setXtversionName, supportsExtendedKeys } from '../terminal.js';
import { getTerminalFocused, setTerminalFocused } from '../terminal-focus-state.js';
import { TerminalQuerier, xtversion } from '../terminal-querier.js';
import { DISABLE_KITTY_KEYBOARD, DISABLE_MODIFY_OTHER_KEYS, ENABLE_KITTY_KEYBOARD, ENABLE_MODIFY_OTHER_KEYS } from '../termio/csi.js';
import { DBP, DFE, DISABLE_MOUSE_TRACKING, EBP, EFE, HIDE_CURSOR, SHOW_CURSOR } from '../termio/dec.js';
import AppContext from './AppContext.js';
import { ClockProvider } from './ClockContext.js';
import CursorDeclarationContext, { type CursorDeclarationSetter } from './CursorDeclarationContext.js';
import StdinContext from './StdinContext.js';
import { TerminalFocusProvider } from './TerminalFocusContext.js';
import { TerminalSizeContext } from './TerminalSizeContext.js';
import { EventEmitter } from '../events/emitter.js';

type Props = {
  readonly children: ReactNode;
  readonly stdin: NodeJS.ReadStream;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly exitOnCtrlC: boolean;
  readonly onExit: (error?: Error) => void;
  readonly terminalColumns: number;
  readonly terminalRows: number;
  readonly onCursorDeclaration?: CursorDeclarationSetter;
  readonly dispatchKeyboardEvent?: (parsedKey: ParsedKey) => void;
  // Selection props (from Ink class)
  readonly selection: unknown;
  readonly onSelectionChange?: () => void;
  readonly onClickAt?: (col: number, row: number) => boolean;
  readonly onHoverAt?: (col: number, row: number) => void;
  readonly getHyperlinkAt?: (col: number, row: number) => string | undefined;
  readonly onOpenHyperlink?: (url: string) => void;
  readonly onMultiClick?: (col: number, row: number, count: 2 | 3) => void;
  readonly onSelectionDrag?: (col: number, row: number) => void;
  readonly onStdinResume?: () => void;
};

type State = {
  readonly error?: Error;
};

/**
 * Root component for Ink apps — provides standard context providers.
 * Replaces Claude Code's App.tsx with a minimal version that doesn't
 * include application-specific lifecycle hooks.
 */
export default class App extends PureComponent<Props, State> {
  readonly state: State = {};

  private lastStdinDataAt = 0;
  private prevRawMode = false;

  // Store raw mode state so we can restore on unmount
  handleSetRawMode(isRaw: boolean): void {
    const { stdin } = this.props;
    if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
      try {
        stdin.setRawMode(isRaw);
        if (isRaw) {
          stdin.resume();
        }
      } catch {
        // setRawMode can fail if stdin is already destroyed
      }
    }
    this.prevRawMode = isRaw;
  }

  override componentWillUnmount(): void {
    this.handleSetRawMode(false);
    // Re-show cursor
    this.props.stdout.write(SHOW_CURSOR);
  }

  override render(): ReactNode {
    const { stdin, stdout, stderr, exitOnCtrlC, onExit, terminalColumns, terminalRows, onCursorDeclaration, dispatchKeyboardEvent } = this.props;

    return (
      <TerminalSizeContext.Provider value={{ columns: terminalColumns, rows: terminalRows }}>
        <AppContext.Provider value={{ exit: onExit }}>
          <StdinContext.Provider value={{
            stdin,
            setRawMode: this.handleSetRawMode.bind(this),
            isRawModeSupported: stdin.isTTY ?? false,
            internal_exitOnCtrlC: exitOnCtrlC,
            internal_eventEmitter: new EventEmitter(),
            internal_querier: null,
          }}>
            <TerminalFocusProvider>
              <ClockProvider>
                <CursorDeclarationContext.Provider value={onCursorDeclaration ?? (() => {})}>
                  {this.props.children}
                </CursorDeclarationContext.Provider>
              </ClockProvider>
            </TerminalFocusProvider>
          </StdinContext.Provider>
        </AppContext.Provider>
      </TerminalSizeContext.Provider>
    );
  }
}
