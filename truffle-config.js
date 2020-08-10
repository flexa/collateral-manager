require('@babel/register')

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*"
    },
    ci: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
  },

  compilers: {
    solc: {
      version: "0.6.10",
      docker: false,
      settings: {
        optimizer: {
          enabled: false
        },
        evmVersion: "istanbul",
        debug: {
          revertStrings: "strip"
        }
      }
    }
  }
}
