import { Event } from './event.js'

export class PasteEvent extends Event {
  readonly data: string

  constructor(data: string) {
    super('paste')
    this.data = data
  }
}

export type PasteEventType = { type: 'paste'; data: string }
