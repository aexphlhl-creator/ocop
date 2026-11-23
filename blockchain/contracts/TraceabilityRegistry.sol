// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract TraceabilityRegistry {
    struct TraceabilityRecord {
        string productId;
        string batchId;
        bytes32 metadataHash;
        bytes32 documentHash;
        string action;
        uint256 timestamp;
        address recorder;
    }

    address public owner;

    mapping(address => bool) public recorders;
    mapping(bytes32 => TraceabilityRecord[]) private productRecords;
    mapping(bytes32 => TraceabilityRecord[]) private batchRecords;

    // Idempotency mapping: recordKey => block number where it was recorded
    mapping(bytes32 => uint256) public recordBlockNumbers;
    // Idempotency mapping: recordKey => whether it has been executed
    mapping(bytes32 => bool) public executedRecords;

    event TraceabilityRecorded(
        string productId,
        string batchId,
        string action,
        bytes32 metadataHash,
        bytes32 documentHash,
        uint256 timestamp,
        address indexed recorder
    );

    event RecorderGranted(address indexed recorder);
    event RecorderRevoked(address indexed recorder);

    error OnlyOwner();
    error OnlyRecorder();
    error EmptyProductId();
    error EmptyAction();
    error DuplicateRecord();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyRecorder() {
        if (!recorders[msg.sender]) revert OnlyRecorder();
        _;
    }

    constructor() {
        owner = msg.sender;
        recorders[msg.sender] = true;
        emit RecorderGranted(msg.sender);
    }

    function grantRecorder(address recorder) external onlyOwner {
        recorders[recorder] = true;
        emit RecorderGranted(recorder);
    }

    function revokeRecorder(address recorder) external onlyOwner {
        recorders[recorder] = false;
        emit RecorderRevoked(recorder);
    }

    function computeRecordKey(
        string calldata productId,
        string calldata batchId,
        string calldata action,
        bytes32 metadataHash,
        bytes32 documentHash
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(productId, batchId, action, metadataHash, documentHash));
    }

    function hasRecord(
        string calldata productId,
        string calldata batchId,
        string calldata action,
        bytes32 metadataHash,
        bytes32 documentHash
    ) external view returns (bool) {
        return executedRecords[computeRecordKey(productId, batchId, action, metadataHash, documentHash)];
    }

    function getRecordBlockNumber(
        string calldata productId,
        string calldata batchId,
        string calldata action,
        bytes32 metadataHash,
        bytes32 documentHash
    ) external view returns (uint256) {
        return recordBlockNumbers[computeRecordKey(productId, batchId, action, metadataHash, documentHash)];
    }

    function recordTraceability(
        string calldata productId,
        string calldata batchId,
        bytes32 metadataHash,
        bytes32 documentHash,
        string calldata action
    ) external onlyRecorder {
        if (bytes(productId).length == 0) revert EmptyProductId();
        if (bytes(action).length == 0) revert EmptyAction();

        bytes32 recordKey = computeRecordKey(productId, batchId, action, metadataHash, documentHash);
        if (executedRecords[recordKey]) revert DuplicateRecord();

        executedRecords[recordKey] = true;
        recordBlockNumbers[recordKey] = block.number;

        TraceabilityRecord memory traceabilityRecord = TraceabilityRecord({
            productId: productId,
            batchId: batchId,
            metadataHash: metadataHash,
            documentHash: documentHash,
            action: action,
            timestamp: block.timestamp,
            recorder: msg.sender
        });

        productRecords[_key(productId)].push(traceabilityRecord);
        if (bytes(batchId).length > 0) {
            batchRecords[_key(batchId)].push(traceabilityRecord);
        }

        emit TraceabilityRecorded(
            productId,
            batchId,
            action,
            metadataHash,
            documentHash,
            block.timestamp,
            msg.sender
        );
    }

    function getProductRecords(string calldata productId)
        external
        view
        returns (TraceabilityRecord[] memory)
    {
        return productRecords[_key(productId)];
    }

    function getBatchRecords(string calldata batchId)
        external
        view
        returns (TraceabilityRecord[] memory)
    {
        return batchRecords[_key(batchId)];
    }

    function _key(string calldata value) private pure returns (bytes32) {
        return keccak256(bytes(value));
    }
}
