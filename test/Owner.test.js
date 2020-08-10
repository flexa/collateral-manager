import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const { ZERO_ADDRESS, EVENT_OWNERSHIP_TRANSFER_AUTHORIZATION, EVENT_OWNER_UPDATE } = Constants

contract('FlexaCollateralManager', function ([
    owner,
    newOwner,
    unknown
]) {
    describe('Owner', () => {
        beforeEach(async function () {
            this.amp = await MockAmp.deployed()
            this.collateralManager = await FlexaCollateralManager.new(
                this.amp.address,
                { from: owner }
            )
        })

        it('sets the initial owner to creator', async function () {
            const currentOwner = await this.collateralManager.owner()

            assert.equal(currentOwner, owner)
        })

        it('sets the initial authorized new owner to the zero address', async function () {
            const currentAuthorizedNewOwner = await this.collateralManager.authorizedNewOwner()

            assert.equal(currentAuthorizedNewOwner, ZERO_ADDRESS)
        })

        describe('when owner authorizes ownership transfer', () => {
            beforeEach(async function () {
                await this.collateralManager.authorizeOwnershipTransfer(
                    newOwner,
                    { from: owner }
                )
            })

            it('sets authorized new owner', async function () {
                const authorizedNewOwner = await this.collateralManager.authorizedNewOwner()

                assert.equal(authorizedNewOwner, newOwner)
            })

            it('emits an event', async function () {
                const logs = await this.collateralManager.getPastEvents()
                const event = logs[0];

                assert.equal(event.event, EVENT_OWNERSHIP_TRANSFER_AUTHORIZATION)
                assert.equal(event.args.authorizedAddress, newOwner)
            })

            describe('when new owner assumes ownership', () => {
                beforeEach(async function () {
                    await this.collateralManager.assumeOwnership(
                        { from: newOwner }
                    )
                })

                it('sets the new owner', async function () {
                    const currentOwner = await this.collateralManager.owner()

                    assert.equal(currentOwner, newOwner)
                })

                it('resets the authorized new owner', async function () {
                    const currentAuthorizedNewOwner = await this.collateralManager.authorizedNewOwner()

                    assert.equal(currentAuthorizedNewOwner, ZERO_ADDRESS)
                })

                it('emits an event', async function () {
                    const logs = await this.collateralManager.getPastEvents()
                    const event = logs[0];

                    assert.equal(event.event, EVENT_OWNER_UPDATE)
                    assert.equal(event.args.oldValue, owner)
                    assert.equal(event.args.newValue, newOwner)
                })
            })

            describe('when unauthorized caller assumes ownership', () => {
                it('reverts', async function () {
                    await shouldFail.reverting(
                        this.collateralManager.assumeOwnership(
                            { from: unknown }
                        )
                    )
                })
            })
        })

        describe('when non-owner authorizes ownership transfer', () => {
            it('reverts', async function () {
                await shouldFail.reverting(
                    this.collateralManager.authorizeOwnershipTransfer(
                        newOwner,
                        { from: unknown }
                    )
                )
            })
        })
    })
})
