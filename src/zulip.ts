import zulip from 'zulip-js'

export const getZulipClient = async (config = { zuliprc: 'zuliprc' }): Promise<any> => {
  return zulip(config)
}

export const sendMessage = async (client: ZulipClient, message: ZulipMessage) => {
  client = client || await getZulipClient()

  return client.messages.send(message)
}

export type ZulipClient = any

export type ZulipMessage = {
  to: string | number | string[] | number[]
  type: 'private' | 'stream'
  topic?: string
  content: string
}






