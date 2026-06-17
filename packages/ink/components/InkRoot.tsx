import React, { type ReactNode, PureComponent } from 'react';
import { INITIAL_STATE, type ParsedKey, parseMultipleKeypresses } from '../parse-keypress.js';
import { supportsExtendedKeys } from '../terminal.js';
import { DISABLE_KITTY_KEYBOARD, DISABLE_MODIFY_OTHER_KEYS, ENABLE_MODIFY_OTHER_KEYS } from '../termio/csi.js';
import { SHOW_CURSOR } from '../termio/dec.js';
import AppContext from './AppContext.js';
import { ClockProvider } from './ClockContext.js';
import CursorDeclarationContext, { type CursorDeclarationSetter } from './CursorDeclarationContext.js';
import StdinContext from './StdinContext.js';
import { TerminalFocusProvider } from './TerminalFocusContext.js';
import { TerminalSizeContext } from './TerminalSizeContext.js';
import { EventEmitter } from '../events/emitter.js';
import { InputEvent } from '../events/input-event.js';

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
  private keyParseState = INITIAL_STATE;
  private eventEmitter = new EventEmitter();
  private stdinDataListener: ((data: Buffer | string) => void) | null = null;

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

  override componentDidMount(): void {
    const { stdin, stdout } = this.props;
    if (stdin.isTTY) {
      this.stdinDataListener = (data: Buffer | string) => {
        this.lastStdinDataAt = Date.now();
        const [parsedKeys, newState] = parseMultipleKeypresses(this.keyParseState, data);
        this.keyParseState = newState;
        for (const parsed of parsedKeys) {
          if (parsed.kind === 'key') {
            const event = new InputEvent(parsed);
            this.eventEmitter.emit('input', event, event.key, event.input);
          }
        }
      };
      stdin.on('data', this.stdinDataListener);
      if (supportsExtendedKeys()) {
        stdout.write(ENABLE_MODIFY_OTHER_KEYS);
      }
    }
  }

  override componentWillUnmount(): void {
    this.handleSetRawMode(false);
    // Re-show cursor
    this.props.stdout.write(SHOW_CURSOR);
    const { stdin, stdout } = this.props;
    if (stdin.isTTY && this.stdinDataListener) {
      stdin.off('data', this.stdinDataListener);
      this.stdinDataListener = null;
    }
    // Flush any remaining buffered key sequences
    if (stdin.isTTY) {
      const [parsedKeys] = parseMultipleKeypresses(this.keyParseState, null);
      for (const parsed of parsedKeys) {
        if (parsed.kind === 'key') {
          const event = new InputEvent(parsed);
          this.eventEmitter.emit('input', event, event.key, event.input);
        }
      }
      // Disable extended key protocols
      if (supportsExtendedKeys()) {
        stdout.write(DISABLE_MODIFY_OTHER_KEYS);
      }
      stdout.write(DISABLE_KITTY_KEYBOARD);
    }
  }

  override render(): ReactNode {
    const { stdin, stdout, exitOnCtrlC, onExit, terminalColumns, terminalRows, onCursorDeclaration } = this.props;

    return (
      <TerminalSizeContext.Provider value={{ columns: terminalColumns, rows: terminalRows }}>
        <AppContext.Provider value={{ exit: onExit }}>
          <StdinContext.Provider value={{
            stdin,
            setRawMode: this.handleSetRawMode.bind(this),
            isRawModeSupported: stdin.isTTY ?? false,
            internal_exitOnCtrlC: exitOnCtrlC,
            internal_eventEmitter: this.eventEmitter,
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
