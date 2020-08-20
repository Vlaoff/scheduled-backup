import { spawn } from 'child_process'
import fs from 'fs'
import * as path from 'path'
import { CronJob } from 'cron'
import { IncomingWebhook } from '@slack/webhook'
import pino from 'pino'
import logdna from 'logdna'
import { getZulipClient, sendMessage } from '@/zulip'

let job: CronJob = null
let logger = console

const configFilePath = path.resolve('./config.js')

fs.watch(configFilePath, () => {
  delete require.cache[configFilePath]
  initJob()
})

async function initJob () {
  console.log('init job')
  job && job.stop()

  const config: Config = require(configFilePath)

  if (config.LOGDNA_KEY) {
    const logdnaLogger = config.LOGDNA_KEY && logdna.createLogger(config.LOGDNA_KEY, {
      env: 'production',
      app: 'scheduled-backup'
    })

    const logdnaTransport = {
      write (msg: string) {
        if (!config.LOGDNA_KEY) {
          return
        }
        logdnaLogger && logdnaLogger.log(msg)
      }
    }

    logger = pino({}, logdnaTransport)
  }

  const slackNotifier = config.notifiers.find(x => x.type === 'slack')
  const zulipNotifier = config.notifiers.find(x => x.type === 'zulip')

  const getSendMessage = async () => {
    const webhook = slackNotifier
      ? new IncomingWebhook(config.notifiers[0].webhook)
      : null

    const zulipClient = zulipNotifier
      ? await getZulipClient()
      : null

    return async (content, topic?) => {
      webhook && await webhook.send(content)
      zulipClient && await sendMessage(zulipClient, {
        to: zulipNotifier.to,
        type: 'stream',
        topic,
        content
      })
    }
  }

  const messageSender = await getSendMessage()


  job = new CronJob(config.cronSchedule, async () => {
    logger.info('job launched')
    await deleteOldFiles(config, messageSender)
    await backupFiles(config, messageSender)

    logger.info(`job completed, next job at ${job.nextDate()}`)
  })

  messageSender(`init new job ${config.cronSchedule}, next job at ${job.nextDate()}`, 'scheduled-backup')

  logger.info(`init new job ${config.cronSchedule}, next job at ${job.nextDate()}`)

  job.start()
}

initJob()

function deleteOldFiles (
  config: Config,
  sendMessage
) {
  return runCommand(
    [
      'delete',
      '--tpslimit', '50',
      '--min-age', config.filesRetention,
      '--exclude-from', './.deleteIgnore',
      config.destinationDir
    ],
    config,
    sendMessage,
    'error while deleting'
  )
}

function backupFiles (
  config: Config,
  sendMessage
) {
  return runCommand(
    [
      'copy',
      '--tpslimit', '50',
      '--exclude-from', './.copyIgnore',
      config.sourceDir, config.destinationDir
    ],
    config,
    sendMessage,
    'error while copying'
  )
}

function runCommand (
  args: any[],
  config: Config,
  sendMessage,
  errorMessage: string
) {
  return new Promise(resolve => {
    const cmd = spawn('rclone', args)
    logger.info(`launched command with args ${args}`)

    cmd.stdout.on('data', (data) => {
      logger.info(`${data}`)
    })

    cmd.stderr.on('data', (data) => {
      logger.error(`${data}`)
    })

    cmd.on('close', (code) => {
      const logMessage = `closed with code ${code} --- ${args}`
      if (code) {
        logger.error(logMessage)
        sendMessage(`${errorMessage} - exit code: ${code}`, 'scheduled-backup')
      } else {
        logger.info(logMessage)
      }

      resolve()
    })
  })
}

type Config = {
  sourceDir: string
  destinationDir: string
  filesRetention: string
  cronSchedule: string
  LOGDNA_KEY?: string
  notifiers: {
    type: string
    channel?: string
    webhook?: string
    to?: string
  }[]
}
