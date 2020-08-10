require('dotenv').config()

const MockAmp = artifacts.require('MockAmp.sol')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager.sol')

module.exports = async function (deployer, network, accounts) {
    let ampAddress

    const { AMP_ADDRESS } = process.env

    if (AMP_ADDRESS === undefined) {
        let mockAmp = await deployer.deploy(MockAmp)
        console.log('\n   > Mock Amp deployment: Success -->', MockAmp.address)

        ampAddress = MockAmp.address
    } else {
        console.log('\n   > Using provided Amp address -->', AMP_ADDRESS)
        ampAddress = AMP_ADDRESS
    }

    await deployer.deploy(FlexaCollateralManager, ampAddress)
    console.log('\n   > FlexaCollateralManager deployment: Success -->', FlexaCollateralManager.address)
}
