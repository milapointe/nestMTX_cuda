import { DateTime } from 'luxon'
import {
  BaseModel,
  column,
  beforeSave,
  afterSave,
  afterFind,
  afterFetch,
  belongsTo,
} from '@adonisjs/lucid/orm'
import crypto from 'node:crypto'
import encryption from '@adonisjs/core/services/encryption'
import Credential from '#models/credential'

import type { BelongsTo } from '@adonisjs/lucid/types/relations'

const makeChecksum = (data: string) => {
  const hash = crypto.createHash('sha256')
  hash.update(data)
  return hash.digest('hex')
}

import type { smartdevicemanagement_v1 } from 'googleapis'

export default class Camera extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare credentialId: number

  @column()
  declare uid: string

  @column()
  declare room: string

  @column()
  declare name: string

  @column()
  declare checksum: string

  @column()
  declare info: smartdevicemanagement_v1.Schema$GoogleHomeEnterpriseSdmV1Device | string | null

  @column()
  declare mtxPath: string | null

  @column()
  declare isEnabled: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeSave()
  static async encrypt(item: Camera) {
    item.checksum = makeChecksum(item.uid)
    item.uid = encryption.encrypt(item.uid)
    item.info = item.info ? encryption.encrypt(JSON.stringify(item.info)) : null
    item.isEnabled = Boolean(item.isEnabled)
  }

  @afterSave()
  static async decryptAfterSave(item: Camera) {
    await Camera.decrypt(item)
  }

  @afterFind()
  static async decrypt(item: Camera) {
    item.uid = encryption.decrypt(item.uid)!
    item.info = item.info ? JSON.parse(encryption.decrypt(item.info)!) : null
    item.isEnabled = Boolean(item.isEnabled)
  }

  @afterFetch()
  static async decryptAll(items: Camera[]) {
    for (const item of items) {
      await Camera.decrypt(item)
    }
  }

  @belongsTo(() => Credential)
  declare credential: BelongsTo<typeof Credential>
}
