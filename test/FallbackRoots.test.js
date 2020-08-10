import { Constants, Helpers } from './utils'

const MockAmp = artifacts.require('MockAmp')
const FlexaCollateralManager = artifacts.require('FlexaCollateralManager')
const {
    ZERO_BYTE,
    ZERO_BYTES4,
    ZERO_BYTES32,
    FLAG_CHANGE_PARTITION,
    DEFAULT_PARTITION,
    EVENT_FALLBACK_ROOT_HASH_SET
} = Constants
const {
    assertRevertErrMsg,
    concatHexData,
    formatCollateralPartition,
    moveTimeForwardSeconds,
} = Helpers

const merkleRoot =
    '0xb152eca4364850f3424c7ac2b337d606c5ca0a3f96f1554f8db33d2f6f130bbe'
const supplyNonce0 = 0
const supplyNonce1 = 1
const supplyAmount = 500

contract('FlexaCollateralManager', function ([
    owner,
    fallbackPublisher,
    supplier,
    unknown
]) {
    describe('Fallback Roots', () => {
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

        it('sets a default fallback root of zero', async function () {
            const fallbackRoot = await this.collateralManager.fallbackRoot()

            assert.equal(fallbackRoot, ZERO_BYTES32)
        })

        it('sets a default max included supply nonce of zero', async function () {
            const fallbackMaxIncludedSupplyNonce = await this.collateralManager.fallbackMaxIncludedSupplyNonce()

            assert.equal(fallbackMaxIncludedSupplyNonce, 0)
        })

        describe('when a supply has been made', () => {
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
            })

            describe('when owner sets the fallback root matching max supply nonce', () => {
                beforeEach(async function () {
                    await this.collateralManager.setFallbackRoot(
                        merkleRoot,
                        supplyNonce1,
                        { from: owner }
                    )
                })

                it('sets the fallback root', async function () {
                    const fallbackRoot = await this.collateralManager.fallbackRoot()

                    assert.equal(fallbackRoot, merkleRoot)
                })

                it('sets the fallback set date', async function () {
                    const lastBlock = await web3.eth.getBlock('latest')
                    const fallbackSetDate = await this.collateralManager.fallbackSetDate()

                    assert.equal(fallbackSetDate.toNumber(), lastBlock.timestamp)
                })

                it('sets the fallback max supply nonce', async function () {
                    const maxSupplyNonce = await this.collateralManager.fallbackMaxIncludedSupplyNonce()

                    assert.equal(maxSupplyNonce.toNumber(), supplyNonce1)
                })

                it('emits an event', async function () {
                    const lastBlock = await web3.eth.getBlock('latest')
                    const logs = await this.collateralManager.getPastEvents()
                    const event = logs[0]

                    assert.equal(event.event, EVENT_FALLBACK_ROOT_HASH_SET)
                    assert.equal(event.args.rootHash, merkleRoot)
                    assert.equal(event.args.maxSupplyNonceIncluded, supplyNonce1)
                    assert.equal(event.args.setDate.toNumber(), lastBlock.timestamp)
                })

                describe('when owner sets a new fallback root with lower nonce', () => {
                    it('reverts', async function () {
                        await assertRevertErrMsg(
                            this.collateralManager.setFallbackRoot(
                                merkleRoot,
                                supplyNonce0,
                                { from: owner }
                            ),
                            'Included supply nonce decreased'
                        )
                    })
                })
            })
        })

        describe('when the fallback scenario is active', () => {
            beforeEach(async function () {
                await this.collateralManager.setFallbackRoot(
                    merkleRoot,
                    supplyNonce0,
                    { from: owner }
                )
                await this.collateralManager.setFallbackWithdrawalDelay(
                    1,
                    { from: owner }
                )

                await moveTimeForwardSeconds(2)
            })

            describe('when owner sets the fallback root', () => {
                it('reverts', async function () {
                    await assertRevertErrMsg(
                        this.collateralManager.setFallbackRoot(
                            merkleRoot,
                            supplyNonce0,
                            { from: owner }
                        ),
                        'Fallback is active'
                    )
                })
            })
        })

        describe('when owner adds the zero root', () => {
            it('reverts', async function () {
                await assertRevertErrMsg(
                    this.collateralManager.setFallbackRoot(
                        ZERO_BYTES32,
                        supplyNonce0,
                        { from: owner }
                    ),
                    'Invalid root'
                )
            })
        })

        describe('when owner adds a root with supply nonce too high', () => {
            it('reverts', async function () {
                await assertRevertErrMsg(
                    this.collateralManager.setFallbackRoot(
                        merkleRoot,
                        supplyNonce1,
                        { from: owner }
                    ),
                    'Included supply nonce exceeds latest supply'
                )
            })
        })

        describe('when fallback publisher adds a root', () => {
            it('is allowed', async function () {
                await this.collateralManager.setFallbackRoot(
                    merkleRoot,
                    supplyNonce0,
                    { from: fallbackPublisher }
                )
            })
        })

        describe('when an unauthorized user adds a root', () => {
            it('reverts', async function () {
                await assertRevertErrMsg(
                    this.collateralManager.setFallbackRoot(
                        merkleRoot,
                        supplyNonce0,
                        { from: unknown }
                    ),
                    'Invalid sender'
                )
            })
        })
    })
})
