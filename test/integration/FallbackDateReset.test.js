import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants } from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { BN } = web3.utils
const { EVENT_FALLBACK_MECHANISM_DATE_RESET } = Constants

contract('FlexaCollateralManager', function ([
    fxcOwner,
    ampOwner,
    owner,
    fallbackPublisher,
    unknown
]) {
    describe('Integration - Fallback Date Reset', function () {
        beforeEach(async function () {
            this.fxc = await MockFXC.new(
                { from: fxcOwner }
            )
            this.amp = await Amp.new(
                this.fxc.address,
                '',
                '',
                { from: ampOwner }
            )
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
            await this.collateralManager.setFallbackPublisher(
                fallbackPublisher,
                { from: owner }
            )
        })

        it('sets a default fallback set date far in the future', async function () {
            const farFutureTimestamp = new BN(2).pow(new BN(200))
            const fallbackSetDate = await this.collateralManager.fallbackSetDate()

            assert.ok(farFutureTimestamp.eq(fallbackSetDate))
        })

        var allowedRoles = [
            { name: 'owner', address: owner },
            { name: 'fallback publisher', address: fallbackPublisher }
        ]

        allowedRoles.forEach(function (role) {
            describe('when the ' + role.name + ' resets the fallback mechanism date', () => {
                beforeEach(async function () {
                    await this.collateralManager.resetFallbackMechanismDate(
                        { from: role.address }
                    )
                })

                it('sets the fallback set date', async function () {
                    const lastBlock = await web3.eth.getBlock('latest')
                    const fallbackSetDate = await this.collateralManager.fallbackSetDate()

                    assert.equal(fallbackSetDate.toNumber(), lastBlock.timestamp)
                })

                it('emits an event', async function () {
                    const lastBlock = await web3.eth.getBlock('latest')
                    const logs = await this.collateralManager.getPastEvents()
                    const event = logs[0]
                    assert.equal(event.event, EVENT_FALLBACK_MECHANISM_DATE_RESET)
                    assert.equal(event.args.newDate.toNumber(), lastBlock.timestamp)
                })
            })
        })

        describe('when an unauthorized user resets the fallback mechanism date', () => {
            it('reverts', async function () {
                await shouldFail.reverting(
                    this.collateralManager.resetFallbackMechanismDate(
                        { from: unknown }
                    )
                )
            })
        })
    })
})
