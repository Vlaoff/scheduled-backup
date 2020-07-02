import { spawn } from 'child_process'
import cron from 'node-cron'
import fs from 'fs'
import * as path from 'path'
import { IncomingWebhook } from '@slack/webhook'

let job

const configFilePath = path.resolve('./config.js')
fs.watch(configFilePath, () => {
  delete require.cache[configFilePath]
  initJob()
})

async function initJob () {
  job && job.destroy()

  const config: Config = require(configFilePath)
  console.log('init new job', config.cronSchedule)

  const webhook = new IncomingWebhook(config.slackWebhook)

  job = cron.schedule(config.cronSchedule, async () => {
    await deleteOldFiles(config, webhook)
    await backupFiles(config, webhook)
  })
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
    console.log('launched command with args', args)

    let log = []
    cmd.stdout.on('data', (data) => {
      log.push({
        type: 'stdout',
        data: `${data}`
      })
    })

    cmd.stderr.on('data', (data) => {
      log.push({
        type: 'stderr',
        data: `${data}`
      })
    })

    cmd.on('close', (code) => {
      if (code) {
        console.log(log)
        webhook.send(`${errorMessage} - exit code: ${code} \n \`${JSON.stringify(log)}\``)
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
}
