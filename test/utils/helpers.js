import { padRight, hexToBytes, bytesToHex, isAddress, toHex } from 'web3-utils'
import { MerkleTree } from 'merkletreejs'
import keccak256 from 'keccak256'

export const assertRevertErrMsg = async (p, code) => {
  let res
  try {
    res = await p
  } catch (error) {
    assert.equal(error.reason, code)
  }
  assert.notExists(res)
}

export const toPartition = (hex) => {
  const v = padRight(hex, 64)
  return v
}

export const concatHexData = (...parts) => {
  const data = parts.reduce((val, d) => {
    const b = hexToBytes(d)
    return val.concat(...b)
  }, [])

  return bytesToHex(data)
}

export const formatCollateralPartition = (address, sub = '') => {
  if (!isAddress(address)) {
    throw new Error(
      `format partition: ${address} is not a valid ethereum address`
    )
  }

  const subHex = padRight(toHex(sub), 16)
  if (subHex.length > 18) {
    throw new Error(`format partition: sub-partition ${subHex} is too long`)
  }

  const flag = '0xcccccccc'

  const partition = concatHexData(flag, subHex, address)
  if (partition.length !== 66) {
    throw new Error(
      `format partition: partition length must be 64 (was ${
      partition.length - 2
      })`
    )
  }
  return partition
}

export const buildTree = (leaves) => {
  const tree = new MerkleTree(leaves, keccak256, { sort: true })
  return tree
}

export const calculateHash = (to, partition, value, nonce) => {
  const toBytes = hexToBytes(to)
  const partitionBytes = hexToBytes(partition)
  const valueHex = `0x${value.toString(16)}`
  const valueBytes = hexToBytes(valueHex)
  for (let i = 0; valueBytes.length < 32; i++) {
    valueBytes.unshift(0)
  }
  const nonceHex = `0x${nonce.toString(16)}`
  const nonceBytes = hexToBytes(nonceHex)
  for (let i = 0; nonceBytes.length < 32; i++) {
    nonceBytes.unshift(0)
  }

  var concatBytes = [toBytes, partitionBytes, valueBytes, nonceBytes]
    .join(',')
    .split(',')
  const hash = keccak256(concatBytes)
  return hash
}

export const generateLeaves = (dataList) => {
  const leaves = dataList.map((data) =>
    calculateHash(data.to, data.partition, data.value, data.nonce)
  )
  return leaves
}

export const generateOperatorData = (flag, fromAddress, nonce, merkleProof) => {
  if (typeof fromAddress !== 'undefined') {
    return web3.eth.abi.encodeParameters(
      ['bytes32', 'address', 'uint256', 'bytes32[]'],
      [flag, fromAddress, nonce, merkleProof],
    );
  }

  return flag;
}

export const calculateFallbackHash = (to, partition, value) => {
  const toBytes = hexToBytes(to)
  const partitionBytes = hexToBytes(partition)

  const valueHex = `0x${value.toString(16)}`
  const valueBytes = hexToBytes(valueHex)
  for (let i = 0; valueBytes.length < 32; i++) {
    valueBytes.unshift(0)
  }

  const concatBytes = [toBytes, partitionBytes, valueBytes]
    .join(',')
    .split(',')
  const hash = keccak256(concatBytes)
  return hash
}

export const generateFallbackLeaves = (dataList) => {
  const leaves = dataList.map((data) =>
    calculateFallbackHash(data.to, data.partition, data.value)
  )
  return leaves
}

export const generateFallbackOperatorData = (flag, fromAddress, maxCumulativeAmount, merkleProof) => {
  return web3.eth.abi.encodeParameters(
    ['bytes32', 'address', 'uint256', 'bytes32[]'],
    [flag, fromAddress, maxCumulativeAmount, merkleProof],
  );
}

export const generateRefundOperatorData = (flag, nonce) => {
  let operatorData = ''
  if (typeof flag !== 'undefined' && flag !== null) {
    operatorData += flag
  }
  if (typeof nonce !== 'undefined' && nonce !== null) {
    operatorData += convertNonceToBytes32(nonce)
  }

  return operatorData
}

export const convertNonceToBytes32 = (nonce) => {
  const nonceBytes = web3.utils.padLeft(nonce, 64, '0').replace('0x', '')
  return nonceBytes
}

export const moveTimeForwardSeconds = async (seconds) => {
  await web3Send({
    jsonrpc: '2.0',
    method: 'evm_increaseTime',
    params: [seconds],
    id: 0,
  })
}

export const web3Send = (params) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(params, (err, result) => {
      if (err) {
        return reject(err)
      }
      return resolve(result)
    })
  })
}

export const wait = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
