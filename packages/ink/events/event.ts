export class Event {
  readonly type: string
  private _didStopImmediatePropagation = false

  constructor(type: string) {
    this.type = type
  }

  didStopImmediatePropagation(): boolean {
    return this._didStopImmediatePropagation
  }

  stopImmediatePropagation(): void {
    this._didStopImmediatePropagation = true
  }
}
