import { Constants, Helpers } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { EVENT_FALLBACK_WITHDRAWAL_DELAY_UPDATE } = Constants
const { assertRevertErrMsg } = Helpers

const fallbackDelay = 100
const oneWeekSeconds = 7 * 24 * 60 * 60

contract('FlexaCollateralManager', function ([
    owner,
    fallbackPublisher
]) {
    describe('Fallback Delay', function () {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
            await this.collateralManager.setFallbackPublisher(
                fallbackPublisher,
                { from: owner }
            )
        })

        it('sets a default fallback delay of 1 week', async function () {
            const fallbackWithdrawalDelaySeconds = await this.collateralManager.fallbackWithdrawalDelaySeconds()

            assert.equal(fallbackWithdrawalDelaySeconds.toNumber(), oneWeekSeconds)
        })

        describe('when the owner sets a fallback delay of ' + fallbackDelay + ' seconds', () => {
            beforeEach(async function () {
                await this.collateralManager.setFallbackWithdrawalDelay(
                    fallbackDelay,
                    { from: owner }
                )
            })

            it('sets the delay', async function () {
                const fallbackWithdrawalDelaySeconds = await this.collateralManager.fallbackWithdrawalDelaySeconds()

                assert.equal(fallbackWithdrawalDelaySeconds.toNumber(), fallbackDelay)
            })

            it('emits an event', async function () {
                const logs = await this.collateralManager.getPastEvents()
                const event = logs[0]

                assert.equal(event.event, EVENT_FALLBACK_WITHDRAWAL_DELAY_UPDATE)
                assert.equal(event.args.oldValue, oneWeekSeconds)
                assert.equal(event.args.newValue, fallbackDelay)
            })
        })

        describe('when the owner sets a fallback delay of 0 seconds', () => {
            it('reverts', async function () {
                await assertRevertErrMsg(
                    this.collateralManager.setFallbackWithdrawalDelay(
                        0,
                        { from: owner }
                    ),
                    'Invalid zero delay seconds'
                )
            })
        })

        describe('when the owner sets a fallback delay of 20 years in seconds', () => {
            it('reverts', async function () {
                const twentyYears = 20 * 365 * 24 * 60 * 60
                await assertRevertErrMsg(
                    this.collateralManager.setFallbackWithdrawalDelay(
                        twentyYears,
                        { from: owner }
                    ),
                    'Invalid delay over 10 years'
                )
            })
        })

        describe('when the fallback publisher sets a fallback delay of ' + fallbackDelay + ' seconds', () => {
            it('reverts', async function () {
                await assertRevertErrMsg(
                    this.collateralManager.setFallbackWithdrawalDelay(
                        fallbackDelay,
                        { from: fallbackPublisher }
                    ),
                    'Invalid sender'
                )
            })
        })
    })
})
