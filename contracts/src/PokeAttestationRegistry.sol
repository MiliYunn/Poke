// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract PokeAttestationRegistry {
    struct Attestation { address submitter; uint64 timestamp; bytes32 schema; }
    mapping(bytes32 => Attestation) public attestations;
    event ReportAttested(bytes32 indexed reportHash, address indexed submitter, uint64 timestamp, bytes32 schema);
    error AlreadyAttested(); error EmptyHash();
    function attest(bytes32 reportHash, bytes32 schema) external {
        if (reportHash == bytes32(0)) revert EmptyHash();
        if (attestations[reportHash].timestamp != 0) revert AlreadyAttested();
        uint64 timestamp = uint64(block.timestamp);
        attestations[reportHash] = Attestation(msg.sender, timestamp, schema);
        emit ReportAttested(reportHash, msg.sender, timestamp, schema);
    }
    function verify(bytes32 reportHash) external view returns (bool) { return attestations[reportHash].timestamp != 0; }
}
