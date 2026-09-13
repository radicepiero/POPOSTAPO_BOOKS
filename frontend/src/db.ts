import Dexie, { Table } from 'dexie'

export interface PendingCopy {
  id?: number
  copyId?: number
  isbn?: string
  image?: string
  title?: string
  status: 'draft' | 'pending' | 'approved'
  createdAt: Date
}

export interface PendingAction {
  id?: number
  type: 'create_copy' | 'confirm_copy'
  payload: object
  retryCount: number
  createdAt: Date
}

class PopostapoDB extends Dexie {
  pendingCopies!: Table<PendingCopy>
  pendingActions!: Table<PendingAction>

  constructor() {
    super('PopostapoBooks')
    this.version(1).stores({
      pendingCopies: '++id, status, isbn',
      pendingActions: '++id, type, createdAt',
    })
  }
}

export const db = new PopostapoDB()
