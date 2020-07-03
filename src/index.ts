import { spawn } from 'child_process'
import fs from 'fs'
import * as path from 'path'
import { CronJob } from 'cron'
import { IncomingWebhook } from '@slack/webhook'
import pino from 'pino'
import logflare from 'pino-logflare'

let job: CronJob = null
let logger = console

const configFilePath = path.resolve('./config.js')

fs.watch(configFilePath, () => {
  delete require.cache[configFilePath]
  initJob()
})

async function initJob () {
  job && job.stop()

  const config: Config = require(configFilePath)
  if (config.logflareKey && config.logflareSource) {
    const stream = logflare.createWriteStream({
      apiKey: config.logflareKey,
      source: config.logflareSource,
      size: 1
    })

    logger = pino({}, stream)
  }


  const webhook = new IncomingWebhook(config.slackWebhook)

  job = new CronJob(config.cronSchedule, async () => {
    await deleteOldFiles(config, webhook)
    await backupFiles(config, webhook)

    logger.info(`job completed, next job at ${job.nextDate()}`)
  })
  logger.info(`init new job ${config.cronSchedule}, next job at ${job.nextDate()}`)

  job.start()
}

initJob()

function deleteOldFiles (
  config: Config,
  webhook: IncomingWebhook
) {
  return runCommand(
    [
      'delete',
      '--min-age', config.filesRetention,
      '--exclude-from', './.deleteIgnore',
      config.destinationDir
    ],
    config,
    webhook,
    'error while deleting'
  )
}

function backupFiles (
  config: Config,
  webhook: IncomingWebhook
) {
  return runCommand(
    [
      'copy',
      '--exclude-from', './.copyIgnore',
      config.sourceDir, config.destinationDir
    ],
    config,
    webhook,
    'error while copying'
  )
}

function runCommand (
  args: any[],
  config: Config,
  webhook: IncomingWebhook,
  errorMessage: string
) {
  return new Promise(resolve => {
    const cmd = spawn('rclone', args)
    logger.info(`launched command with args ${args}`)

    cmd.stdout.on('data', (data) => {
      logger.info(`${data}`)
    })

    cmd.stderr.on('data', (data) => {
      logger.info(`${data}`)
    })

    cmd.on('close', (code) => {
      if (code) {
        logger.error(code)
        webhook.send(`${errorMessage} - exit code: ${code}`)
      }
      resolve()
    })
  })
}

type Config = {
  slackWebhook: string
  sourceDir: string
  destinationDir: string
  filesRetention: string
  cronSchedule: string
  logflareKey: string
  logflareSource: string
}
