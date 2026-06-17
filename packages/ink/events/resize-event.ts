import { Event } from './event.js'

export class ResizeEvent extends Event {
  readonly columns: number
  readonly rows: number

  constructor(columns: number, rows: number) {
    super('resize')
    this.columns = columns
    this.rows = rows
  }
}

export type ResizeEventType = { type: 'resize'; columns: number; rows: number }
