'use strict'

const startIpfs = require('../commands/start-ipfs')
const request = require('ipfs-registry-mirror-common/utils/retry-request')
const timeout = require('ipfs-registry-mirror-common/utils/timeout-promise')

const cleanUpOps = []

const cleanUp = async () => {
  Promise.all(
    cleanUpOps.map(op => op())
  )
    .then(() => {
      process.exit(0)
    })
}

process.on('SIGTERM', cleanUp)
process.on('SIGINT', cleanUp)

const ipfsInstance = (function() {
  let ipfs = null

  return {
    get: () => ipfs,
    set: (instance) => { ipfs = instance }
  }
}())

module.exports = (options) => {
  return async (req, res, next) => {
    if (ipfsInstance.get() !== null) {
      res.locals.ipfs = ipfsInstance.get()
      return next()
    }

    const ipfs = await startIpfs(options)

    cleanUpOps.push(() => {
      return new Promise((resolve) => {
        if (options.ipfs.node !== 'proc') {
          return resolve()
        }

        ipfs.stop(() => {
          console.info('😈 IPFS node stopped') // eslint-disable-line no-console
          ipfsInstance.set(null)
          resolve()
        })
      })
    })

    console.info('🗂️  Loading registry index from', options.registry) // eslint-disable-line no-console

    try {
      const mirror = await request(Object.assign({}, options.request, {
        uri: options.registry,
        json: true
      }))

      console.info('☎️  Dialling registry mirror', mirror.ipfs.addresses.join(',')) // eslint-disable-line no-console

      await timeout(
        ipfs.api.swarm.connect(mirror.ipfs.addresses[0]),
        options.registryConnectTimeout
      )

      console.info('📱️ Connected to registry') // eslint-disable-line no-console
    } catch (error) {
      console.info('📴 Not connected to registry') // eslint-disable-line no-console
    }

    ipfsInstance.set(ipfs)
    res.locals.ipfs = ipfs
    next()
  }
}