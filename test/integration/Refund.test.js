import { shouldFail } from 'openzeppelin-test-helpers'
import { Constants, Helpers } from '../utils'

const MockFXC = artifacts.require('MockFXC')
const Amp = artifacts.require('Amp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const CollateralPoolPartitionValidator = artifacts.require('CollateralPoolPartitionValidator')
const {
    ZERO_ADDRESS,
    ZERO_BYTE,
    ZERO_BYTES32,
    FLAG_CHANGE_PARTITION,
    FLAG_REFUND,
    DEFAULT_PARTITION,
    PREFIX_COLLATERAL_POOL,
    SWITCH_TO_DEFAULT_PARTITION,
    EVENT_SUPPLY_REFUND,
} = Constants
const {
    concatHexData,
    formatCollateralPartition,
    generateRefundOperatorData,
    moveTimeForwardSeconds
} = Helpers

const supplyAmount = 500
const supplyNonce3 = 3

contract('Integration - FlexaCollateralManager', function ([
    fxcOwner,
    ampOwner,
    owner,
    fallbackPublisher,
    supplier,
    unknown,
]) {
    describe('Supply Refunds', function () {
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
            this.validator = await CollateralPoolPartitionValidator.new(
                this.amp.address,
                { from: ampOwner }
            )

            await this.amp.setPartitionStrategy(
                PREFIX_COLLATERAL_POOL,
                this.validator.address,
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

            this.partitionA = formatCollateralPartition(
                this.collateralManager.address,
                'A',
            )
            this.switchToPartitionA = concatHexData(
                FLAG_CHANGE_PARTITION,
                this.partitionA
            )
            this.partitionB = formatCollateralPartition(
                this.collateralManager.address,
                'B',
            )
            this.switchToPartitionB = concatHexData(
                FLAG_CHANGE_PARTITION,
                this.partitionB
            )

            await this.collateralManager.addPartition(
                this.partitionA,
                { from: owner }
            )
            await this.collateralManager.addPartition(
                this.partitionB,
                { from: owner }
            )

            await this.fxc.mint(
                supplier,
                supplyAmount,
                { from: fxcOwner }
            )
            await this.fxc.approve(
                this.amp.address,
                supplyAmount,
                { from: supplier }
            )
            await this.amp.swap(
                supplier,
                { from: supplier }
            )

            await this.fxc.mint(
                owner,
                10000,
                { from: fxcOwner }
            )
            await this.fxc.approve(
                this.amp.address,
                10000,
                { from: owner }
            )
            await this.amp.swap(
                owner,
                { from: owner }
            )

            await this.amp.transferByPartition(
                DEFAULT_PARTITION, // _partition,
                owner, // _from,
                this.collateralManager.address, // _to,
                5000, // _value,
                this.switchToPartitionA, // calldata _data,
                ZERO_BYTE, // calldata _operatorData
                { from: owner }
            )

            await this.amp.transferByPartition(
                DEFAULT_PARTITION, // _partition,
                owner, // _from,
                this.collateralManager.address, // _to,
                5000, // _value,
                this.switchToPartitionB, // calldata _data,
                ZERO_BYTE, // calldata _operatorData
                { from: owner }
            )
        })

        describe('when supplier has supplied', () => {
            beforeEach(async function () {
                await this.amp.transferByPartition(
                    DEFAULT_PARTITION, // _partition,
                    supplier, // _from,
                    this.collateralManager.address, // _to,
                    supplyAmount, // _value,
                    this.switchToPartitionA, // calldata _data,
                    ZERO_BYTE, // calldata _operatorData
                    { from: supplier }
                )

                this.operatorData = generateRefundOperatorData(
                    FLAG_REFUND,
                    supplyNonce3
                )
            })

            describe('when the fallback period is inactive', () => {
                describe('when the supplier attempts refund', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                supplier, // _to,
                                supplyAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
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
                        await this.amp.transferByPartition(
                            this.partitionA, // _partition,
                            this.collateralManager.address, // _from,
                            supplier, // _to,
                            supplyAmount, // _value,
                            SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                            this.operatorData, // calldata _operatorData
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
                        assert.equal(event.args.nonce, supplyNonce3)
                    })

                    it('removes the recorded supply', async function () {
                        const supply = await this.collateralManager.nonceToSupply(supplyNonce3)

                        assert.equal(supply.supplier, ZERO_ADDRESS)
                        assert.equal(supply.partition, ZERO_BYTES32)
                        assert.equal(supply.amount.toNumber(), 0)
                    })

                    describe('when the supplier reattempts refund', () => {
                        it('reverts', async function () {
                            await shouldFail.reverting(
                                this.amp.transferByPartition(
                                    this.partitionA, // _partition,
                                    this.collateralManager.address, // _from,
                                    supplier, // _to,
                                    supplyAmount, // _value,
                                    SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                    this.operatorData, // calldata _operatorData
                                    { from: supplier }
                                )
                            )
                        })
                    })
                })

                describe('when the owner executes the refund', () => {
                    beforeEach(async function () {
                        await this.amp.transferByPartition(
                            this.partitionA, // _partition,
                            this.collateralManager.address, // _from,
                            owner, // _to,
                            supplyAmount, // _value,
                            SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                            this.operatorData, // calldata _operatorData
                            { from: owner }
                        )
                    })

                    it('records the supplier as refunded in the event', async function () {
                        const logs = await this.collateralManager.getPastEvents()
                        const event = logs[0]

                        assert.equal(event.event, EVENT_SUPPLY_REFUND)
                        assert.equal(event.args.supplier, supplier)
                        assert.equal(event.args.partition, this.partitionA)
                        assert.equal(event.args.amount, supplyAmount)
                        assert.equal(event.args.nonce, supplyNonce3)
                    })
                })

                describe('when the fallback publisher executes the refund', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                fallbackPublisher, // _to,
                                supplyAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: fallbackPublisher }
                            )
                        )
                    })
                })

                describe('when an unauthorized user executes the refund', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                unknown, // _to,
                                supplyAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: unknown }
                            )
                        )
                    })
                })

                describe('when the supplier provides an incorrect nonce', () => {
                    beforeEach(async function () {
                        this.operatorData = generateRefundOperatorData(
                            FLAG_REFUND,
                            supplyNonce3 + 1
                        )
                    })

                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                supplier, // _to,
                                supplyAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })

                describe('when the supplier provides an incorrect value', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionA, // _partition,
                                this.collateralManager.address, // _from,
                                supplier, // _to,
                                supplyAmount + 1, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })

                describe('when the supplier provides an incorrect partition', () => {
                    it('reverts', async function () {
                        await shouldFail.reverting(
                            this.amp.transferByPartition(
                                this.partitionB, // _partition,
                                this.collateralManager.address, // _from,
                                supplier, // _to,
                                supplyAmount, // _value,
                                SWITCH_TO_DEFAULT_PARTITION, // calldata _data,
                                this.operatorData, // calldata _operatorData
                                { from: supplier }
                            )
                        )
                    })
                })
            })
        })
    })
})
