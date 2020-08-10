import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants, Helpers } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const {
    ZERO_ADDRESS,
    ZERO_BYTE,
    ZERO_BYTES4,
    ZERO_BYTES32,
    FLAG_CHANGE_PARTITION,
    FLAG_REFUND,
    DEFAULT_PARTITION,
    SWITCH_TO_DEFAULT_PARTITION,
    EVENT_SUPPLY_REFUND
} = Constants
const {
    concatHexData,
    formatCollateralPartition,
    generateRefundOperatorData,
    moveTimeForwardSeconds,
} = Helpers

const supplyAmount = 500
const supplyNonce1 = 1

contract('FlexaCollateralManager', function ([
    owner,
    fallbackPublisher,
    supplier,
    unknown,
]) {
    describe('Supply Refunds', function () {
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

            this.partitionA = formatCollateralPartition(
                this.collateralManager.address,
                'A',
            )
            this.switchToPartitionA = concatHexData(
                FLAG_CHANGE_PARTITION,
                this.partitionA
            )

            await this.collateralManager.addPartition(
                this.partitionA,
                { from: owner }
            )
        })

        describe('when supplier has supplied', () => {
            beforeEach(async function () {
                await this.amp.tokensReceived(
                    ZERO_BYTES4,
                    DEFAULT_PARTITION,
                    supplier,
                    supplier,
                    this.collateralManager.address,
                    supplyAmount,
                    this.switchToPartitionA,
                    ZERO_BYTE,
                    { from: supplier }
                )

                this.operatorData = generateRefundOperatorData(
                    FLAG_REFUND,
                    supplyNonce1
                )
            })

            describe('when the fallback period is inactive', () => {
                describe('when the supplier reattempts refund', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                this.partitionA, // _partition
                                supplier, // _operator
                                this.collateralManager.address, // _from
                                supplier, // to
                                supplyAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })
            })

            describe('when the fallback period is active', () => {
                beforeEach(async function () {
                    await this.collateralManager.setFallbackWithdrawalDelay(
                        1,
                        { from: owner }
                    )

                    await this.collateralManager.resetFallbackMechanismDate({ from: owner });

                    await moveTimeForwardSeconds(2)
                })

                describe('when the supplier refunds', () => {
                    beforeEach(async function () {
                        await this.amp.tokensToTransfer(
                            ZERO_BYTES4, // _functionSig
                            this.partitionA, // _partition
                            supplier, // _operator
                            this.collateralManager.address, // _from
                            supplier, // to
                            supplyAmount, // _value
                            SWITCH_TO_DEFAULT_PARTITION, // data
                            this.operatorData, // _operatorData
                            { from: supplier }
                        )
                    })

                    it('emits an event', async function () {
                        const logs = await this.collateralManager.getPastEvents()
                        const event = logs[0]

                        assert.equal(event.event, EVENT_SUPPLY_REFUND)
                        assert.equal(event.args.supplier, supplier)
                        assert.equal(event.args.partition, this.partitionA)
                        assert.equal(event.args.amount, supplyAmount)
                        assert.equal(event.args.nonce, 1)
                    })

                    it('removes the recorded supply', async function () {
                        const supply = await this.collateralManager.nonceToSupply(1)

                        assert.equal(supply.supplier, ZERO_ADDRESS)
                        assert.equal(supply.partition, ZERO_BYTES32)
                        assert.equal(supply.amount.toNumber(), 0)
                    })

                    describe('when the supplier reattempts refund', () => {
                        it('reverts', async function () {
                            await shouldFail.reverting(
                                this.amp.tokensToTransfer(
                                    ZERO_BYTES4, // _functionSig
                                    this.partitionA, // _partition
                                    supplier, // _operator
                                    this.collateralManager.address, // _from
                                    supplier, // to
                                    supplyAmount, // _value
                                    SWITCH_TO_DEFAULT_PARTITION, // data
                                    this.operatorData, // _operatorData
                                    { from: supplier }
                                )
                            )
                        })
                    })
                })

                describe('when the owner executes the refund', () => {
                    it('is allowed', async function () {
                        await this.amp.tokensToTransfer(
                            ZERO_BYTES4, // _functionSig
                            this.partitionA, // _partition
                            owner, // _operator
                            this.collateralManager.address, // _from
                            owner, // to
                            supplyAmount, // _value
                            SWITCH_TO_DEFAULT_PARTITION, // data
                            this.operatorData, // _operatorData
                            { from: owner }
                        )
                    })
                })

                describe('when the fallback publisher executes the refund', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                this.partitionA, // _partition
                                fallbackPublisher, // _operator
                                this.collateralManager.address, // _from
                                fallbackPublisher, // to
                                supplyAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: fallbackPublisher }
                            )
                        )
                    })
                })

                describe('when an unauthorized user executes the refund', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                this.partitionA, // _partition
                                unknown, // _operator
                                this.collateralManager.address, // _from
                                unknown, // to
                                supplyAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: unknown }
                            )
                        )
                    })
                })

                describe('when the supplier provides an incorrect nonce', () => {
                    beforeEach(async function () {
                        this.operatorData = generateRefundOperatorData(
                            FLAG_REFUND,
                            supplyNonce1 + 1
                        )
                    })

                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                this.partitionA, // _partition
                                supplier, // _operator
                                this.collateralManager.address, // _from
                                supplier, // to
                                supplyAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })

                describe('when the supplier provides an incorrect value', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                this.partitionA, // _partition
                                supplier, // _operator
                                this.collateralManager.address, // _from
                                supplier, // to
                                supplyAmount + 1, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })

                describe('when the supplier provides an incorrect partition', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.tokensToTransfer(
                                ZERO_BYTES4, // _functionSig
                                DEFAULT_PARTITION, // _partition
                                supplier, // _operator
                                this.collateralManager.address, // _from
                                supplier, // to
                                supplyAmount, // _value
                                SWITCH_TO_DEFAULT_PARTITION, // data
                                this.operatorData, // _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })
            })
        })
    })
})
