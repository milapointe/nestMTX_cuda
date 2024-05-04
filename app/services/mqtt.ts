import type { ApiService, CommandContext } from '#services/api'
import type { LoggerService } from '@adonisjs/core/types'
import type { Logger } from '@adonisjs/logger'
import type { MqttClient } from 'mqtt'
import { ApiServiceRequestError } from '#services/api'
import { inspect } from 'node:util'
import env from '#start/env'
import Joi from 'joi'

const requestPayloadSchema = Joi.object({
  command: Joi.string().valid('list', 'read', 'create', 'update', 'delete').required(),
  module: Joi.string().required(),
  requestId: Joi.string().required(),
  payload: Joi.alternatives().conditional('command', {
    switch: [
      { is: 'create', then: Joi.object().required() },
      { is: 'update', then: Joi.object().required() },
    ],
    otherwise: Joi.forbidden(),
  }),
})

export class MqttService {
  // readonly #api: ApiService
  readonly #client: MqttClient
  readonly #logger: Logger

  constructor(_api: ApiService, client: MqttClient, logger: LoggerService) {
    // this.#api = api
    this.#client = client
    this.#logger = logger.child({ service: 'mqtt' })
    this.#client.on('connect', () => {
      this.#logger.info('Connected to broker')
      this.#client.subscribe(MqttService.topic('requests'), (error) => {
        if (error) {
          this.#logger.error('Failed to subscribe to requests topic', error)
        } else {
          this.#logger.info(`Subscribed to "${MqttService.topic('requests')}" topic`)
        }
      })
    })
    this.#client.on('reconnect', () => {
      this.#logger.info('Reconnecting to broker')
    })
    this.#client.on('close', () => {
      this.#logger.info('Disconnected from broker')
    })
    this.#client.on('disconnect', () => {
      this.#logger.info('Broker requested disconnection')
    })
    this.#client.on('offline', () => {
      this.#logger.info('Client offline')
    })
    this.#client.on('error', (error) => {
      this.#logger.error(error.message, error)
    })
    this.#client.on('message', (topic, message, packet) => {
      // @todo: implement this as how we are going to handle requests
      switch (topic) {
        case MqttService.topic('requests'):
          this.#onRequest(message)
          break

        default:
          this.#logger.info(inspect({ topic, message, packet }, false, 20, true))
          break
      }
    })
    this.#client.connect()
  }

  async #onRequest(message: Buffer) {
    const stringified = message.toString()
    let payload: any
    try {
      payload = JSON.parse(stringified)
    } catch {
      this.#logger.error(`Failed to parse message: ${inspect(stringified, false, 20, true)}`)
      return
    }
    const { value, error } = requestPayloadSchema.validate(payload)
    if (error) {
      return this.#handleError(error)
    }
    const context: CommandContext = value
  }

  async #handleError(error: Error) {
    if (error instanceof ApiServiceRequestError) {
      const topic = MqttService.topic('responses', error.context.requestId)
      try {
        await this.#client.publishAsync(
          topic,
          JSON.stringify({
            error: {
              message: error.message,
              details: error.details,
              context: error.context,
            },
          })
        )
      } catch (err) {
        this.#logger.error(`Failed to publish response to "${topic}": ${err.message}`)
      }
      return
    }
    const topic = MqttService.topic('failures')
    const payload: any = {
      error: {
        message: error.message,
        details: [],
        context: {},
      },
    }
    if (error instanceof Joi.ValidationError) {
      payload.error.details = error.details
    }
    try {
      await this.#client.publishAsync(topic, JSON.stringify(payload))
    } catch (err) {
      this.#logger.error(`Failed to publish failure to "${topic}": ${err.message}`)
    }
  }

  static topic(...parts: string[]): string {
    const base = env.get('MQTT_BASE_TOPIC', 'nestmtx')
    return [base, ...parts].join('/')
  }
}
